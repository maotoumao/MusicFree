import { download } from '@/core/download';
import { t } from '@/i18n';
import { showActionSheetPanel } from '@/widgets/overlays/ActionSheetPanel';
import { showConfirmDialog } from '@/widgets/overlays/ConfirmDialog';

import type { DownloadSummary } from '@/core/download';

/**
 * 下载页的全局与条目级破坏性操作
 *
 * 放在页面辅助文件而非组件里：这些都是事件处理，不需要 React 上下文——
 * i18n 有模块级 `t`，overlay 走命令式 `show*`
 */

/**
 * 溢出菜单：按当前队列状态给出可用的全局操作
 *
 * 三项都**按条件出现而非置灰**：一个永远点不动的「全部继续」只会让人反复去试它
 * 为什么可用；设计稿也是按存在性列显示条件的
 */
export function showDownloadOverflowMenu(summary: DownloadSummary): void {
    const items = [];
    if (summary.downloading > 0) {
        items.push({
            icon: 'pause' as const,
            label: t('downloadManager.pauseAll'),
            onPress: () => download.pauseAll(),
        });
    }
    // 还有在下的就不给「全部继续」：那时它要么无事可做，要么语义含混
    if (summary.downloading === 0 && summary.paused > 0) {
        items.push({
            icon: 'play' as const,
            label: t('downloadManager.resumeAll'),
            onPress: () => download.resumeAll(),
        });
    }
    if (summary.inProgress + summary.queued + summary.failed > 0) {
        items.push({
            icon: 'trash-2' as const,
            label: t('downloadManager.cancelAll'),
            danger: true,
            separatorBefore: items.length > 0,
            onPress: confirmCancelAll,
        });
    }
    if (items.length === 0) return;
    showActionSheetPanel({ items });
}

/** 全部取消不可逆（原生会连断点一起删），故必须过确认 */
function confirmCancelAll(): void {
    showConfirmDialog({
        title: t('downloadManager.cancelAllConfirm.title'),
        message: t('downloadManager.cancelAllConfirm.message'),
        confirmText: t('downloadManager.cancelAll'),
        danger: true,
    })
        .then(ok => {
            if (ok) download.cancelAll();
        })
        .catch(() => undefined);
}
