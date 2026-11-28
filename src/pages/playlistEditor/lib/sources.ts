import { playlist } from '@/core/playlist';
import { t } from '@/i18n';
import { mediaKey } from '@/utils/media';
import { showConfirmDialog } from '@/widgets/overlays/ConfirmDialog';

import type { IconName } from '@/components/ui/icons.generated';
import type { MediaRef } from '@/types';

/** 编辑范围：本地歌单 / 收藏歌单，两者独立编辑、互不影响 */
export type PlaylistEditorTab = 'local' | 'starred';

/**
 * 列表行：两种歌单投影成的共同形状
 * 只存原始事实，展示文案在渲染期翻译（避免切语言后快照留旧译文）
 */
export interface PlaylistEditorRow {
    /** 稳定身份：本地=歌单 id，收藏=mediaKey */
    key: string;
    /** 原始标题，可能为空白 */
    title: string;
    /** 本地歌单的曲目数 */
    musicCount?: number;
    /** 收藏歌单的作者 */
    artist?: string;
    /** 收藏歌单的音源平台 */
    sourceLabel?: string;
}

/** 底部批量动作的完整描述：本地=删除（危险），收藏=取消收藏（中性） */
export interface PlaylistEditorAction {
    labelKey: 'playlistEditor.deletePlaylist' | 'playlistEditor.unstar';
    icon: IconName;
    danger: boolean;
}

/** 一个编辑范围的数据与能力：快照读 + 即时写 */
export interface PlaylistEditorSource {
    loadInitial(): Promise<readonly PlaylistEditorRow[]>;
    /** 按新序即时落库 */
    reorder(order: readonly PlaylistEditorRow[]): Promise<void>;
    /** 移除选中项：内含二次确认；true=已移除、false=用户取消 */
    remove(rows: readonly PlaylistEditorRow[]): Promise<boolean>;
    /** 底部动作的呈现描述 */
    action: PlaylistEditorAction;
}

/** 快照与 core 不一致（外部并发改动）：调用方应重新加载 */
class SnapshotConflictError extends Error {
    constructor() {
        super('playlistEditor：歌单快照已过期');
    }
}

/** 本地歌单：排除 favorite（受保护、恒首位且不可删），可重排与删除 */
function localPlaylistSource(): PlaylistEditorSource {
    return {
        loadInitial: async () =>
            playlist
                .getLocalPlaylists()
                .filter(item => item.kind !== 'favorite')
                .map(item => ({
                    key: item.id,
                    title: item.title,
                    musicCount: item.musicCount,
                })),
        // core 只收用户歌单顺序，favorite 由其固定在首位
        reorder: order =>
            playlist.reorderLocalPlaylists(order.map(row => row.key)),
        remove: async rows => {
            const ok = await showConfirmDialog({
                title: t('playlistEditor.deletePlaylists.title'),
                message: t('playlistEditor.deletePlaylists.message', {
                    count: rows.length,
                }),
                confirmText: t('common.delete'),
                danger: true,
            });
            if (!ok) {
                return false;
            }
            await playlist.removeLocalPlaylists(rows.map(row => row.key));
            return true;
        },
        action: {
            labelKey: 'playlistEditor.deletePlaylist',
            icon: 'trash-2',
            danger: true,
        },
    };
}

/** 收藏歌单：取消收藏而非删除（远程歌单不属于本机，不暗示删除其本体） */
function starredPlaylistSource(): PlaylistEditorSource {
    // 行 key 是 mediaKey，写回 core 需还原成 MediaRef
    // 一次建表批量反查；任一行对不上即视为快照过期，绝不静默丢弃后提交残缺顺序
    const resolveRefs = (rows: readonly PlaylistEditorRow[]): MediaRef[] => {
        const byKey = new Map(
            playlist
                .getStarredPlaylists()
                .map(item => [
                    mediaKey(item),
                    { platform: item.platform, id: item.id },
                ]),
        );
        return rows.map(row => {
            const ref = byKey.get(row.key);
            if (!ref) {
                throw new SnapshotConflictError();
            }
            return ref;
        });
    };
    return {
        loadInitial: async () =>
            playlist.getStarredPlaylists().map(item => ({
                key: mediaKey(item),
                title: item.title ?? '',
                artist: item.artist,
                sourceLabel: item.platform,
            })),
        reorder: order => playlist.reorderStarredPlaylists(resolveRefs(order)),
        remove: async rows => {
            const ok = await showConfirmDialog({
                title: t('playlistEditor.unstarPlaylists.title'),
                message: t('playlistEditor.unstarPlaylists.message', {
                    count: rows.length,
                }),
                confirmText: t('playlistEditor.unstar'),
                danger: true,
            });
            if (!ok) {
                return false;
            }
            // 单次提交：逐个 unstar 会 N 次全量写盘，且中途失败会留下部分生效
            await playlist.unstarPlaylists(resolveRefs(rows));
            return true;
        },
        action: {
            labelKey: 'playlistEditor.unstar',
            // 实心心形 = 当前已收藏、点击取消；不用垃圾桶，避免暗示删除远程歌单本体
            icon: 'heart-filled',
            danger: false,
        },
    };
}

/** 按 tab 现造数据源（非 hook）：两者差异全封装在各自 source 内，页面零 tab 分支 */
export function getPlaylistEditorSource(
    tab: PlaylistEditorTab,
): PlaylistEditorSource {
    return tab === 'local' ? localPlaylistSource() : starredPlaylistSource();
}
