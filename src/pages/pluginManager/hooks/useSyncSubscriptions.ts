/**
 * 「同步订阅源」编排 hook：从各订阅源地址重新拉取、安装/更新其中的插件（可带进新插件）
 * 交由全局 busy 编排后台执行，完成后显示汇总 toast；syncing 由页顶 Loading 横幅承载并跨页保留
 */
import { useAtomValue } from 'jotai';
import { useCallback } from 'react';

import { showToast } from '@/components/overlay';
import { pluginManager } from '@/core/plugin';
import { t } from '@/i18n';

import { summarizeInstall } from '../lib/installSummary';
import { pluginOpAtom, startPluginOp } from '../lib/pluginOp';

export function useSyncSubscriptions(): {
    syncSubscriptions: () => void;
    syncing: boolean;
} {
    const syncing = useAtomValue(pluginOpAtom) === 'syncing';

    const syncSubscriptions = useCallback(() => {
        // 从订阅源拉取是 install 语义，复用安装汇总
        const started = startPluginOp('syncing', async () =>
            summarizeInstall(await pluginManager.updateFromSubscriptions()),
        );
        if (!started) {
            showToast(t('pluginManager.opInProgress'), { type: 'info' });
        }
    }, []);

    return { syncSubscriptions, syncing };
}
