import { history } from '@/core/history';
import { localMusic } from '@/core/localMusic';
import { playlist } from '@/core/playlist';
import { t } from '@/i18n';
import { claim } from '@/infra/stash';
import { mediaKey } from '@/utils/media';
import { showConfirmDialog } from '@/widgets/overlays/ConfirmDialog';

import type { IconName } from '@/components/ui/icons.generated';
import type { MusicItem } from '@/types';

/**
 * 路由参数 = 可序列化的来源描述符
 * 含插件私有字段的曲目快照经 infra/stash 传 ticket，不直接进导航参数
 */
export type MusicSelectionParams =
    | { kind: 'localPlaylist'; playlistId: string }
    | { kind: 'history' }
    | { kind: 'localLibrary' }
    | { kind: 'generic'; ticket: string };

/**
 * 来源注入：快照读 + 即时写
 * 能力用「函数在不在」表达——reorder/remove 缺席即该能力禁用
 */
export interface MusicSelectionSource {
    /** 进入时快照加载当前曲目 */
    loadInitial(): Promise<readonly MusicItem[]>;
    /** 手动排序：传完整新序、乐观即时落库（失败由页面回滚）；缺=不可拖 */
    reorder?: (order: readonly MusicItem[]) => Promise<void>;
    /** 移除选中项：内含二次确认 + 落地；true=已删、false=用户取消（非乐观）；缺=不可删 */
    remove?: (items: readonly MusicItem[]) => Promise<boolean>;
}

/** 批量动作的结果：导航去留与业务是否生效分开表达 */
export interface BatchOutcome {
    /** close=返回来源页、stay=留在本页 */
    disposition: 'close' | 'stay';
    /** 业务已生效（可清空选中）；取消或失败为 false，保留选中好重试 */
    applied: boolean;
}

/** 底部批量动作：图标在上、标签在下的一个按钮 */
export interface BatchAction {
    icon: IconName;
    label: string;
    danger?: boolean;
    /** 能力未就绪时保留占位但禁用（如下载） */
    disabled?: boolean;
    /** 对选中项执行 */
    execute(items: readonly MusicItem[]): Promise<BatchOutcome>;
}

/** 本地歌单：曲目快照 + 即时整序 + 移出歌单（二次确认） */
function localPlaylistSource(playlistId: string): MusicSelectionSource {
    return {
        loadInitial: () =>
            playlist.loadLocalPlaylist(playlistId).then(detail => {
                // null = 歌单不存在（区别于合法空歌单），走错误分支
                if (!detail) {
                    throw new Error(`本地歌单不存在：${playlistId}`);
                }
                return detail.musicList;
            }),
        reorder: order => playlist.reorderLocalPlaylistMusic(playlistId, order),
        remove: async items => {
            // 只移出歌单、不动文件，轻确认即可
            const ok = await showConfirmDialog({
                title: t('musicSelection.removeFromPlaylist.title'),
                message: t('musicSelection.removeFromPlaylist.message', {
                    count: items.length,
                }),
                confirmText: t('musicSelection.actions.remove'),
                danger: true,
            });
            if (!ok) {
                return false;
            }
            await playlist.removeMusicFromLocalPlaylist(playlistId, items);
            return true;
        },
    };
}

/**
 * 已领取的 stash 快照，按 ticket 键控
 * claim 破坏性（读即删），而 source 可能被重建（useMemo 不保证保留缓存）——快照须活得比闭包久
 * 只在 generic 来源用；页面卸载时由 releaseSnapshot 清掉，不长期占内存
 */
const claimedSnapshots = new Map<string, readonly MusicItem[]>();

/** 页面卸载时释放该 ticket 的快照 */
export function releaseSnapshot(ticket: string): void {
    claimedSnapshots.delete(ticket);
}

/** 播放历史：newest-first 快照 + 批量移出历史（不可手动排序） */
function historySource(): MusicSelectionSource {
    return {
        loadInitial: async () => history.getHistory(),
        remove: async items => {
            const ok = await showConfirmDialog({
                title: t('musicSelection.removeFromHistory.title'),
                message: t('musicSelection.removeFromHistory.message', {
                    count: items.length,
                }),
                confirmText: t('musicSelection.actions.remove'),
                danger: true,
            });
            if (!ok) {
                return false;
            }
            // core 只有整表替换可批量：按 platform+id 滤掉选中项后写回
            const dropped = new Set(items.map(mediaKey));
            history.replace(
                history
                    .getHistory()
                    .filter(item => !dropped.has(mediaKey(item))),
            );
            return true;
        },
    };
}

/** 本地音乐库「全部」曲目：只移出库、不动物理文件（下次扫描会扫回），不可手动排序 */
function localLibrarySource(): MusicSelectionSource {
    return {
        loadInitial: async () => localMusic.getMusicList(),
        remove: async items => {
            const ok = await showConfirmDialog({
                title: t('musicSelection.removeFromLibrary.title'),
                message: t('musicSelection.removeFromLibrary.message', {
                    count: items.length,
                }),
                confirmText: t('musicSelection.actions.remove'),
                danger: true,
            });
            if (!ok) {
                return false;
            }
            localMusic.removeFromLibrary(
                items.map(item => ({ platform: item.platform, id: item.id })),
            );
            return true;
        },
    };
}

/**
 * 只读来源：曲目由唤起方经 stash 交付（插件私有字段不可靠序列化，故不进导航参数）
 * 无排序无移除，只能对选中项做发送类动作
 */
function genericSource(ticket: string): MusicSelectionSource {
    return {
        loadInitial: async () => {
            const cached = claimedSnapshots.get(ticket);
            if (cached) {
                return cached;
            }
            const snapshot = claim<readonly MusicItem[]>(ticket);
            if (!snapshot) {
                throw new Error(`曲目快照已失效：${ticket}`);
            }
            claimedSnapshots.set(ticket, snapshot);
            return snapshot;
        },
    };
}

/**
 * 按来源描述符现造 source（非 hook）：各来源的加载/排序/删除差异全封装在对应 provider
 * 页面零 kind 分支，新增来源只在此登记一个 provider
 */
export function getSelectionSource(
    params: MusicSelectionParams,
): MusicSelectionSource {
    switch (params.kind) {
        case 'localPlaylist':
            return localPlaylistSource(params.playlistId);
        case 'history':
            return historySource();
        case 'localLibrary':
            return localLibrarySource();
        case 'generic':
            return genericSource(params.ticket);
    }
}
