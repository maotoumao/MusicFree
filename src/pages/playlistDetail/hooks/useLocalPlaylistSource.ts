import { useNavigation } from '@react-navigation/native';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { showToast } from '@/components/overlay';
import { errorLog } from '@/core/errorLog';
import {
    PlaylistMusicSortMode,
    playlist,
    useLoadedPlaylistDetail,
    usePlaylistStatus,
} from '@/core/playlist';
import { useT } from '@/i18n';
import { showConfirmDialog } from '@/widgets/overlays/ConfirmDialog';

import type {
    CollectionHeader,
    CollectionMenuAction,
    CollectionSortOption,
    MusicCollectionSource,
} from '@/widgets/musicCollectionDetail/types';
import type { MusicItemOptionsSource } from '@/widgets/overlays/MusicItemOptionsPanel';

/** 首屏异步加载的分型；竞态只认最后一次请求的结果 */
type LoadPhase = 'loading' | 'ready' | 'missing' | 'error';

/** 排序模式的展示顺序（UI 固定，与 core 枚举定义顺序解耦）：每字段升序在前、降序紧随 */
const SORT_MODES = [
    PlaylistMusicSortMode.Manual,
    PlaylistMusicSortMode.Title,
    PlaylistMusicSortMode.TitleDesc,
    PlaylistMusicSortMode.Artist,
    PlaylistMusicSortMode.ArtistDesc,
    PlaylistMusicSortMode.Album,
    PlaylistMusicSortMode.AlbumDesc,
    PlaylistMusicSortMode.AddedAt,
    PlaylistMusicSortMode.AddedAtDesc,
] as const;

/**
 * 本地歌单 → MusicCollectionSource
 * 首屏 loadLocalPlaylist 异步加载（id 切换/重试竞态），之后消费 useLoadedPlaylistDetail 响应式快照
 * 排序落 core；单曲移除走 MusicItemOptionsPanel；删除歌单 / 编辑信息经 overflow
 */
export function useLocalPlaylistSource(id: string): MusicCollectionSource {
    const t = useT();
    const detail = useLoadedPlaylistDetail(id);
    const status = usePlaylistStatus();
    const navigation = useNavigation();
    // phase 绑定发起时的 id：id 刚切、effect 未跑时不泄露上一个 id 的 missing/error
    const [loaded, setLoaded] = useState<{ id: string; phase: LoadPhase }>({
        id,
        phase: 'loading',
    });
    const [reloadToken, setReloadToken] = useState(0);

    // 首屏异步加载：id 切换或重试都重跑，cancelled 守卫只认最后一次结果
    useEffect(() => {
        let cancelled = false;
        setLoaded({ id, phase: 'loading' });
        playlist
            .loadLocalPlaylist(id)
            .then(result => {
                if (!cancelled) {
                    setLoaded({ id, phase: result ? 'ready' : 'missing' });
                }
            })
            .catch(error => {
                if (!cancelled) {
                    errorLog.capture({ source: 'uncaught', error });
                    setLoaded({ id, phase: 'error' });
                }
            });
        return () => {
            cancelled = true;
        };
    }, [id, reloadToken]);

    const retryInitialLoad = useCallback(() => {
        setReloadToken(n => n + 1);
    }, []);

    // 只认当前 id 的加载结果；id 刚切换、effect 尚未重置时按 loading 处理
    const phase = loaded.id === id ? loaded.phase : 'loading';

    // 不 memo：useT 的 t 引用恒定，memo 依赖 t 会锁旧译文（同 home）；列表行重渲由 renderItem 稳定性挡、与此无关
    // 无 detail（加载中/不存在/失败）时标题留空，避免闪现「未知标题」
    const title = detail
        ? detail.kind === 'favorite'
            ? t('media.favoritePlaylist')
            : detail.title.trim() || t('media.unknownTitle')
        : '';
    const header: CollectionHeader = {
        artwork: detail?.artwork,
        fallbackIcon: detail?.kind === 'favorite' ? 'heart' : 'list-music',
        title,
        description: detail?.description,
        details: detail
            ? [
                  t('playlistDetail.createdAt', {
                      date: dayjs(detail.createdAt).format('YYYY-MM-DD'),
                  }),
              ]
            : [],
    };

    /** 排序：固定 9 模式、label 走共享排序词汇（枚举值即 i18n 叶子名）、当前项取快照 sortMode、选中落 core（失败给反馈） */
    const sortOptions: CollectionSortOption[] = SORT_MODES.map(mode => ({
        key: mode,
        label: t(`media.sortOption.${mode}`),
    }));
    const sort = detail
        ? {
              activeKey: detail.sortMode,
              options: sortOptions,
              onSelect: (key: string) => {
                  playlist
                      .setLocalPlaylistMusicSortMode(
                          id,
                          key as PlaylistMusicSortMode,
                      )
                      .catch(() =>
                          showToast(t('feedback.operationFailed'), {
                              type: 'error',
                          }),
                      );
              },
          }
        : undefined;

    // degraded（存储只读）：排序/编辑/删除、以及单曲移除都禁用/不提供
    const degraded = status === 'degraded';

    // 单曲「更多」复用 MusicItemOptionsPanel；可写 → localPlaylist（自带「从歌单移除」）；degraded 退 generic、不给移除
    const itemOptionsSource = useMemo<MusicItemOptionsSource>(
        () =>
            degraded
                ? { kind: 'generic' }
                : { kind: 'localPlaylist', playlistId: id },
        [degraded, id],
    );
    const deletePlaylist = () => {
        const name =
            detail?.kind === 'favorite'
                ? t('media.favoritePlaylist')
                : detail?.title.trim() || t('media.unknownTitle');
        showConfirmDialog({
            title: t('playlistDetail.delete'),
            message: t('playlistDetail.deleteConfirm', { name }),
            confirmText: t('common.delete'),
            danger: true,
        })
            .then(ok => {
                if (!ok) {
                    return;
                }
                // 先返回上一页、再后台删除，详情页不闪 loading
                navigation.goBack();
                playlist.removeLocalPlaylists([id]).catch(() =>
                    showToast(t('feedback.operationFailed'), {
                        type: 'error',
                    }),
                );
            })
            .catch(() => {});
    };
    const overflowActions: CollectionMenuAction[] = [];
    if (detail) {
        overflowActions.push({
            label: t('playlistDetail.edit'),
            icon: 'pencil',
            disabled: degraded,
            onPress: () => navigation.navigate('EditPlaylistInfo', { id }),
        });
        if (detail.kind !== 'favorite') {
            overflowActions.push({
                label: t('playlistDetail.delete'),
                icon: 'trash-2',
                danger: true,
                disabled: degraded,
                onPress: deletePlaylist,
            });
        }
    }

    // 有 detail 即就绪（含空歌单）；否则按加载结果分派 loading / error
    const listState = detail
        ? 'ready'
        : phase === 'missing' || phase === 'error'
        ? 'error'
        : 'loading';

    return {
        kind: 'playlist',
        header,
        musicList: detail?.musicList ?? [],
        listState,
        errorMessage:
            phase === 'missing' ? t('playlistDetail.notFound') : undefined,
        // 不存在不可重试（missing）；仅加载失败给重试
        retryInitialLoad: phase === 'error' ? retryInitialLoad : undefined,
        sort,
        overflowActions,
        itemOptionsSource,
        editDisabledReason: degraded ? t('playlistDetail.degraded') : undefined,
    };
}
