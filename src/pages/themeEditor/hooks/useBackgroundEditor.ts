import { useCallback, useEffect, useRef, useState } from 'react';
import { PixelRatio, useWindowDimensions } from 'react-native';

import { showToast } from '@/components/overlay';
import {
    resolveBackgroundImageUri,
    theme,
    THEME_BACKGROUND_BLUR_DEFAULT,
} from '@/core/theme';
import { useT } from '@/i18n';
import { bakeCoverBitmap } from '@/infra/bakeCoverBitmap';
import { pickFile } from '@/infra/documentPicker';

import {
    accentFollowsWallpaper,
    wallpaperAccent,
} from '../lib/wallpaperAccent';

import type { ThemeBackgroundSourceInput, ThemePack } from '@/core/theme';

/** 决定烘焙结果的形状参数；调完这几项都要重烘一次位图 */
interface BackgroundShape {
    readonly blurRadius: number;
    readonly focusX: number;
    readonly focusY: number;
    readonly scale: number;
}

interface BackgroundEditor {
    /** 正在烘焙或写盘：期间禁用会触发再次烘焙的控件 */
    readonly busy: boolean;
    /**
     * 已结算的提交次数（成功与失败都计）；单调递增
     * 调用方靠它感知「这一轮交接结束了」——只看 busy 的话，若某次提交在同一个 React
     * 批次里从 true 走到 false，依赖数组不变、effect 不会重跑，接力标记就永远放不掉
     */
    readonly settledCommits: number;
    pick(): void;
    /** 按新的形状参数重新烘焙当前原图；返回是否真的入队（无背景 / 原图丢失时为 false） */
    reshape(shape: BackgroundShape): boolean;
    /** 只改图层参数，不重新烘焙 */
    setLayers(visibility: number, surfaceOpacity: number): void;
    remove(): void;
}

/**
 * 背景的全部写操作：选图 / 重新烘焙 / 图层参数 / 移除
 *
 * 烘焙串行执行且只保留最后一次请求——滑块连续松手时中间态没有意义，
 * 排队跑完只会白白多写几次盘。
 *
 * 强调色跟着壁纸走：新选一张图时，若强调色没被用户自定义过（或仍是上一张壁纸给的默认值），
 * 就换成这张图的主色（新图没有主色则退回内建）；移除背景时同样条件下退回内建。
 * 用户自己改过的强调色一律不动。知情取舍：跟随得来的强调色在配色页与手设的无从区分，
 * 点「自动」退回的是内建色而非壁纸主色，要找回只能重新选图；它按选图那一刻的可见度抬过对比度，
 * 事后把可见度拉到两端不会重算——它是个起点色，不是承诺
 */
function useBackgroundEditor(pack: ThemePack | undefined): BackgroundEditor {
    const t = useT();
    const { width, height } = useWindowDimensions();
    const [busy, setBusy] = useState(false);
    const [settledCommits, setSettledCommits] = useState(0);
    const packRef = useRef(pack);
    packRef.current = pack;
    const mountedRef = useRef(true);
    const runningRef = useRef(false);
    const pendingRef = useRef<(() => Promise<void>) | null>(null);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const run = useCallback((task: () => Promise<void>) => {
        pendingRef.current = task;
        if (runningRef.current) {
            return;
        }
        runningRef.current = true;
        setBusy(true);
        const drain = async () => {
            try {
                while (pendingRef.current) {
                    const next = pendingRef.current;
                    pendingRef.current = null;
                    await next();
                }
            } finally {
                runningRef.current = false;
                if (mountedRef.current) {
                    setBusy(false);
                    setSettledCommits(count => count + 1);
                }
            }
        };
        drain().catch(() => undefined);
    }, []);

    /**
     * 烘焙 + 落库；失败只提示，core 保留旧背景
     * 不传图层参数：烘焙要几百毫秒，期间用户可能还在拖可见度，
     * 由 core 在提交时取当下的值，避免拿旧值把新调整盖回去
     */
    const commit = useCallback(
        async (
            packId: string,
            source: ThemeBackgroundSourceInput,
            sourceUri: string,
            shape: BackgroundShape,
        ) => {
            const pixelRatio = PixelRatio.get();
            try {
                const baked = await bakeCoverBitmap({
                    sourceUri,
                    targetWidth: width * pixelRatio,
                    targetHeight: height * pixelRatio,
                    focusX: shape.focusX,
                    focusY: shape.focusY,
                    scale: shape.scale,
                    // 模糊半径按 dp 存、按目标位图像素烘焙，换设备密度观感一致
                    blurRadius: shape.blurRadius * pixelRatio,
                });
                // 读 core 当下的包而不是 packRef：后者要等重渲才刷新，而烘焙 / 写盘那几百毫秒里
                // 用户可能已经切到配色页改了颜色
                const before = findPack(packId);
                // 只重烘（改模糊 / 缩放）沿用上次的主色：微调不该让「仍是默认值」的判断失准
                const accentColor =
                    source.kind === 'pick' && before
                        ? wallpaperAccent(before, baked)
                        : before?.background?.accentColor ?? null;
                await theme.setPackBackground(packId, {
                    source,
                    imageBase64: baked.base64,
                    blurRadius: shape.blurRadius,
                    focusX: shape.focusX,
                    focusY: shape.focusY,
                    scale: shape.scale,
                    averageColor: baked.averageColor,
                    accentColor,
                });
                if (source.kind === 'pick' && before) {
                    // 以写盘后的强调色判是否还跟着上一张壁纸：期间用户改过就不碰。
                    // 新图没有主色时 accentColor 为 null → 退回内建，不让上一张的颜色留成「像是用户设的」
                    const after = findPack(packId);
                    if (
                        after &&
                        accentFollowsWallpaper(
                            after.colors.primary,
                            before.background,
                        )
                    ) {
                        theme.setPackColor(packId, 'primary', accentColor);
                    }
                }
            } catch {
                if (mountedRef.current) {
                    showToast(t('themeEditor.background.saveFailed'), {
                        type: 'error',
                    });
                }
            }
        },
        [height, t, width],
    );

    const pick = useCallback(() => {
        const current = packRef.current;
        if (!current) {
            return;
        }
        const choose = async () => {
            let picked;
            try {
                picked = await pickFile({ types: ['image/*'] });
            } catch {
                showToast(t('themeEditor.background.pickFailed'), {
                    type: 'error',
                });
                return;
            }
            if (!picked || !mountedRef.current) {
                return;
            }
            // 换图沿用当前的形状参数，只有首次设背景才落到默认值
            const background = packRef.current?.background;
            run(() =>
                commit(
                    current.id,
                    { kind: 'pick', uri: picked.uri, name: picked.name },
                    picked.uri,
                    {
                        blurRadius:
                            background?.blurRadius ??
                            THEME_BACKGROUND_BLUR_DEFAULT,
                        focusX: background?.focusX ?? 0.5,
                        focusY: background?.focusY ?? 0.5,
                        scale: background?.scale ?? 1,
                    },
                ),
            );
        };
        choose().catch(() => undefined);
    }, [commit, run, t]);

    const reshape = useCallback(
        (shape: BackgroundShape) => {
            const current = packRef.current;
            const background = current?.background;
            if (!current || !background) {
                return false;
            }
            const sourceUri = resolveBackgroundImageUri(
                background.sourceFileName,
            );
            if (!sourceUri) {
                return false;
            }
            run(() => commit(current.id, { kind: 'keep' }, sourceUri, shape));
            return true;
        },
        [commit, run],
    );

    const setLayers = useCallback(
        (visibility: number, surfaceOpacity: number) => {
            const current = packRef.current;
            if (!current?.background) {
                return;
            }
            theme.setPackBackgroundLayers(
                current.id,
                visibility,
                surfaceOpacity,
            );
        },
        [],
    );

    const remove = useCallback(() => {
        const current = packRef.current;
        if (!current?.background) {
            return;
        }
        run(async () => {
            try {
                const before = findPack(current.id);
                await theme.clearPackBackground(current.id);
                // 强调色是这张壁纸给的默认值就一起退回内建；用户自己改过的不动
                // 没自定义过时清空是 no-op，不必另判
                const primary = findPack(current.id)?.colors.primary;
                if (accentFollowsWallpaper(primary, before?.background)) {
                    theme.setPackColor(current.id, 'primary', null);
                }
            } catch {
                if (mountedRef.current) {
                    showToast(t('feedback.operationFailed'), { type: 'error' });
                }
            }
        });
    }, [run, t]);

    return { busy, settledCommits, pick, reshape, setLayers, remove };
}

/** core 里当下的这套主题；内置主题 / 已删除时为 undefined */
function findPack(packId: string): ThemePack | undefined {
    return theme.getPreferences().packs.find(pack => pack.id === packId);
}

export { useBackgroundEditor };
export type { BackgroundShape };
