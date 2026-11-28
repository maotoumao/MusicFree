import { useNavigation, usePreventRemove } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';

import { showToast } from '@/components/overlay';
import {
    playlist,
    useLoadedPlaylistDetail,
    usePlaylistStatus,
} from '@/core/playlist';
import { t } from '@/i18n';
import { pickFile } from '@/infra/documentPicker';
import { showConfirmDialog } from '@/widgets/overlays/ConfirmDialog';

import type { LocalPlaylistDetail } from '@/core/playlist';

/** 封面草稿：undefined=未改（用 detail.artwork）；string=新选图 uri；null=清除、恢复自动封面 */
export type ArtworkDraft = string | null | undefined;

/** 封面呈现态：持久自定义 / 持久自动 / 待保存新图 / 待保存恢复自动 */
export type ArtworkState = 'custom' | 'auto' | 'pendingImage' | 'pendingAuto';

/** 进入编辑时锁定的初始基线：变更判定只对它比较，不随响应式 detail 漂移 */
interface Baseline {
    title: string;
    description: string;
}

export interface EditPlaylistDraft {
    detail: LocalPlaylistDetail | undefined;
    /** 初始基线已锁定、草稿可编辑；未就绪时页面继续显示 Loading */
    draftReady: boolean;
    degraded: boolean;
    isFavorite: boolean;
    title: string;
    setTitle: (value: string) => void;
    description: string;
    setDescription: (value: string) => void;
    /** 封面预览 uri；undefined = 回退占位图标 */
    artworkPreviewUri: string | undefined;
    /** 封面呈现态（映射状态说明文案） */
    artworkState: ArtworkState;
    /** 是否显示「恢复自动封面」动作 */
    canRestoreAuto: boolean;
    /** 打开系统选择器换封面（取消不改；失败 toast） */
    changeArtwork: () => void;
    /** 恢复自动封面（清除自定义 / 撤销新选图） */
    restoreAutoArtwork: () => void;
    titleError: boolean;
    canSave: boolean;
    save: () => void;
}

/**
 * 歌单信息编辑草稿：读 detail → 锁基线 → 本地草稿（名称 / 简介 / 封面）→ 乐观保存 + 放弃确认
 * 变更判定对进入时的基线比较（非响应式 detail，避免外部更新期间误覆盖）；保存先返回再后台写（避开卸载期重渲），失败以 toast 提示
 */
export function useEditPlaylistDraft(id: string): EditPlaylistDraft {
    const navigation = useNavigation();
    const detail = useLoadedPlaylistDetail(id);
    const degraded = usePlaylistStatus() === 'degraded';
    const isFavorite = detail?.kind === 'favorite';

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [artworkDraft, setArtworkDraft] = useState<ArtworkDraft>(undefined);

    // 进入时锁定初始基线（仅一次）：变更判定对基线比较；响应式 detail 仅用于渲染持久化结果
    const baselineRef = useRef<Baseline | null>(null);
    const [draftReady, setDraftReady] = useState(false);
    useEffect(() => {
        if (detail && baselineRef.current === null) {
            baselineRef.current = {
                title: detail.title,
                description: detail.description ?? '',
            };
            setTitle(detail.title);
            setDescription(detail.description ?? '');
            setDraftReady(true);
        }
    }, [detail]);

    const baseline = baselineRef.current;
    // 提交前 trim；输入本身不改写（仅以 trim 值做校验与比较）
    const titleTrimmed = title.trim();
    const descriptionTrimmed = description.trim();
    const titleChanged =
        baseline != null && !isFavorite && titleTrimmed !== baseline.title;
    const descriptionChanged =
        baseline != null && descriptionTrimmed !== baseline.description;
    const artworkChanged = artworkDraft !== undefined;
    const hasChanges = titleChanged || descriptionChanged || artworkChanged;
    const titleError = !isFavorite && titleTrimmed === '';
    const canSave = hasChanges && !titleError && !degraded;

    // 封面呈现：未改用 detail 当前派生值（响应式）；草稿态按 artworkDraft
    const artworkState: ArtworkState =
        artworkDraft === undefined
            ? detail?.hasCustomArtwork
                ? 'custom'
                : 'auto'
            : artworkDraft === null
            ? 'pendingAuto'
            : 'pendingImage';
    // 恢复自动封面草稿：自动封面由 core 从最近加入的有封面歌曲派生，UI 无法准确复现 → 回退占位
    const artworkPreviewUri =
        artworkDraft === undefined
            ? detail?.artwork
            : artworkDraft ?? undefined;
    // 显示恢复动作：当前呈现自定义封面（持久自定义或新选图），非已恢复草稿态
    const canRestoreAuto =
        typeof artworkDraft === 'string' ||
        (artworkDraft === undefined && !!detail?.hasCustomArtwork);

    // 换封面：系统选择器选图（取消不改草稿；失败 toast，不制造空草稿）
    // 选择器进行中防重入：快速双击的第二次会被原生以 PickingInProgress 拒绝、误报选取失败
    const pickingArtworkRef = useRef(false);
    const changeArtwork = useCallback(() => {
        if (pickingArtworkRef.current) {
            return;
        }
        pickingArtworkRef.current = true;
        const pick = async () => {
            try {
                const picked = await pickFile({ types: ['image/*'] });
                if (picked) {
                    setArtworkDraft(picked.uri);
                }
            } catch {
                showToast(t('editPlaylistInfo.pickArtworkFailed'), {
                    type: 'error',
                });
            } finally {
                pickingArtworkRef.current = false;
            }
        };
        pick().catch(() => {});
    }, []);
    // 恢复自动封面：当前为自定义封面 → 写 null 清除；已是自动 → 回未改（undefined），不发无谓写
    // 依当前响应式 detail 判定（与 canRestoreAuto 同源），避免并发改封面时按钮显示与动作结果错位
    const restoreAutoArtwork = useCallback(() => {
        setArtworkDraft(detail?.hasCustomArtwork ? null : undefined);
    }, [detail?.hasCustomArtwork]);

    // 保存后主动离开的放行标记
    const leavingAfterSaveRef = useRef(false);

    // 乐观保存：先返回卸载本页，再后台写库——避免写后 detail 重渲与 pop 卸载在 New Arch 下的挂载冲突（addViewAt）
    // 校验已由 canSave 拦截；写失败（罕见）以全局 toast 提示
    const save = useCallback(() => {
        if (!detail || !canSave) {
            return;
        }
        leavingAfterSaveRef.current = true;
        navigation.goBack();
        const write = async () => {
            try {
                if (titleChanged || descriptionChanged) {
                    await playlist.updateLocalPlaylist(id, {
                        title: titleChanged ? titleTrimmed : undefined,
                        description: descriptionChanged
                            ? descriptionTrimmed || null
                            : undefined,
                    });
                }
                if (artworkChanged) {
                    await playlist.setLocalPlaylistArtwork(id, artworkDraft);
                }
            } catch {
                showToast(t('editPlaylistInfo.saveFailed'), { type: 'error' });
            }
        };
        write().catch(() => {});
    }, [
        detail,
        canSave,
        titleChanged,
        descriptionChanged,
        artworkChanged,
        id,
        titleTrimmed,
        descriptionTrimmed,
        artworkDraft,
        navigation,
    ]);

    // 拦截返回：保存主动离开放行；保存中吞掉（等完成、不确认）；否则确认放弃
    usePreventRemove(hasChanges, ({ data }) => {
        if (leavingAfterSaveRef.current) {
            navigation.dispatch(data.action);
            return;
        }
        showConfirmDialog({
            title: t('editPlaylistInfo.discardTitle'),
            message: t('editPlaylistInfo.discardMessage'),
            confirmText: t('editPlaylistInfo.discardChanges'),
            cancelText: t('editPlaylistInfo.continueEditing'),
            danger: true,
        })
            .then(ok => {
                if (ok) {
                    navigation.dispatch(data.action);
                }
            })
            .catch(() => {});
    });

    return {
        detail,
        draftReady,
        degraded,
        isFavorite,
        title,
        setTitle,
        description,
        setDescription,
        artworkPreviewUri,
        artworkState,
        canRestoreAuto,
        changeArtwork,
        restoreAutoArtwork,
        titleError,
        canSave,
        save,
    };
}
