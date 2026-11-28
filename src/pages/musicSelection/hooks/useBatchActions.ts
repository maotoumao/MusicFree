import { showToast } from '@/components/overlay';
import { download, isDownloadSupported } from '@/core/download';
import { player } from '@/core/player';
import { useT } from '@/i18n';
import { showAddToPlaylistPanel } from '@/widgets/overlays/AddToPlaylistPanel';

import type { BatchAction, MusicSelectionSource } from '../lib/sources';
import type { MusicItem } from '@/types';

/**
 * 底部批量动作集 = 公共发送类 + 来源特定动作
 * 发送类对所有来源同构（把选中项送去别处、不改当前列表）；移除由 source.remove 决定有无
 * 不缓存：t 引用恒定，memo 会锁住旧译文；动作对象轻、每次构造无压力
 */
export function useBatchActions(
    source: MusicSelectionSource,
    onRemoved: (removed: readonly MusicItem[]) => void,
): readonly BatchAction[] {
    const t = useT();
    const failed = () =>
        showToast(t('feedback.operationFailed'), { type: 'error' });

    const actions: BatchAction[] = [
        {
            icon: 'list-start',
            label: t('musicSelection.actions.playNext'),
            execute: async items => {
                try {
                    await player.enqueueNext([...items]);
                } catch {
                    failed();
                    return { disposition: 'stay', applied: false };
                }
                showToast(t('musicSelection.enqueuedNext'), {
                    type: 'success',
                });
                return { disposition: 'stay', applied: true };
            },
        },
        {
            icon: 'folder-plus',
            label: t('musicSelection.actions.addToPlaylist'),
            // 面板负责后续（选歌单 / 新建），开面板不代表已加入，故保留选中
            execute: async items => {
                showAddToPlaylistPanel({ items: [...items] });
                return { disposition: 'stay', applied: false };
            },
        },
        {
            icon: 'download',
            label: t('common.download'),
            // iOS 暂无下载引擎：置灰保位，不抽走一格（底部是固定几格的横向条）
            disabled: !isDownloadSupported,
            // 本地来源的歌、已下过的歌、已在队列的歌都会被 enqueue 跳过，
            // 落库失败也同样不计数——两者在返回值里分不开，故只报「加入了多少首」，
            // 不替剩下那些编理由（说成「其余已下载」在落库失败时就是假话）
            execute: async items => {
                const accepted = download.enqueue(items);
                if (accepted === 0) {
                    showToast(t('musicSelection.downloadNoneEnqueued'), {
                        type: 'info',
                    });
                    return { disposition: 'stay', applied: false };
                }
                showToast(
                    accepted === items.length
                        ? t('musicSelection.downloadEnqueued', {
                              count: accepted,
                          })
                        : t('musicSelection.downloadPartlyEnqueued', {
                              count: accepted,
                          }),
                    { type: 'success' },
                );
                return { disposition: 'stay', applied: true };
            },
        },
    ];

    const remove = source.remove;
    if (remove) {
        actions.push({
            icon: 'trash-2',
            label: t('musicSelection.actions.remove'),
            danger: true,
            execute: async items => {
                try {
                    // 确认与落地都在 source 内；false = 用户取消，保留选中好重试
                    if (!(await remove(items))) {
                        return { disposition: 'stay', applied: false };
                    }
                } catch {
                    failed();
                    return { disposition: 'stay', applied: false };
                }
                onRemoved(items);
                return { disposition: 'stay', applied: true };
            },
        });
    }
    return actions;
}
