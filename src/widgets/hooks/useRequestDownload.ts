import { useCallback } from 'react';

import { showToast } from '@/components/overlay';
import { download } from '@/core/download';
import { mediaMeta } from '@/core/mediaMeta';
import { useT } from '@/i18n';

import type { MusicItem } from '@/types';

/**
 * 请求下载一首歌，并按结果给回执
 *
 * 收在一处而非各入口自己写：单曲面板与正在播放页工具行的判重与措辞必须一致，
 * 分头实现会各自漂移
 *
 * **判重以播放锚点为准，不是下载记录**——各表面显示「已下载」用的就是锚点，
 * 点击必须问同一件事。两者分家的话，「移除下载记录」（刻意保留文件与锚点）之后，
 * 按钮显示「已下载」却会重新入队
 *
 * 界面只表达「已下载 / 未下载」两态，所以在途任务在按钮上看着仍是「下载」；
 * 重复点属预期行为，给中性回执而非报错
 */
export function useRequestDownload(): (item: MusicItem) => void {
    const t = useT();
    return useCallback(
        (item: MusicItem) => {
            const ref = { platform: item.platform, id: item.id };
            if (mediaMeta.hasLocalFile(ref)) {
                showToast(t('feedback.download.alreadyDownloaded'), {
                    type: 'info',
                });
                return;
            }
            // 点击这一刻重读：界面上那份是渲染时的快照，期间任务可能已经推进
            if (download.getRecord(ref)) {
                showToast(t('feedback.download.inQueue'), { type: 'info' });
                return;
            }
            // 记录非法或落库失败都会被拒，按实际入队数给结论，别把失败报成成功
            if (download.enqueue([item]) === 0) {
                showToast(t('feedback.operationFailed'), { type: 'error' });
                return;
            }
            showToast(t('feedback.download.addedToQueue'), { type: 'success' });
        },
        [t],
    );
}
