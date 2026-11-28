import { useEffect, useSyncExternalStore } from 'react';

import {
    resolveBackgroundImageUri,
    resolveThemePack,
    theme,
} from '@/core/theme';
import { setThemePreview } from '@/design';

import type { ThemePack } from '@/core/theme';

function subscribe(onChange: () => void): () => void {
    return theme.subscribe(onChange);
}

/**
 * 订阅正在编辑的主题，并把它投影为全局预览
 *
 * 编辑器不持草稿：颜色与背景参数都即时写 core，投影随之更新，
 * 于是编辑器自身的顶栏 / 卡片 / 滑块就是这套主题的真实样张。
 * 投影用真实的烘焙位图——静止态看到的就是最终效果；
 * 拖动期间由 `BackgroundStage` 盖一层按原图现算的预览层跟手。
 */
function useEditedThemePack(packId: string): ThemePack | undefined {
    const pack = useSyncExternalStore(subscribe, () =>
        resolveThemePack(theme.getPreferences(), packId),
    );
    useEffect(() => {
        if (!pack) {
            return;
        }
        const background = pack.background;
        setThemePreview({
            id: pack.id,
            scheme: pack.scheme,
            colors: pack.colors,
            background: background
                ? {
                      uri:
                          resolveBackgroundImageUri(background.fileName) ??
                          null,
                      visibility: background.visibility,
                      surfaceOpacity: background.surfaceOpacity,
                      averageColor: background.averageColor,
                  }
                : null,
            autoContrast: pack.autoContrast,
        });
    }, [pack]);
    useEffect(() => () => setThemePreview(undefined), []);
    return pack;
}

/** 当前背景原图的可读 URI，供预览自绘与重新烘焙复用 */
function resolveSourceUri(pack: ThemePack): string | undefined {
    return pack.background
        ? resolveBackgroundImageUri(pack.background.sourceFileName)
        : undefined;
}

export { useEditedThemePack, resolveSourceUri };
