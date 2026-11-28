/**
 * 「全部更新」编排 hook：由溢出菜单触发 updateAll，交由全局 busy 编排后台执行，完成后显示汇总 toast
 * updating 从全局 pluginOpAtom 读取，由页顶 Loading 横幅承载，并在跨页切换后保留
 */
import { useAtomValue } from 'jotai';
import { useCallback } from 'react';

import { showToast } from '@/components/overlay';
import { pluginManager } from '@/core/plugin';
import { t } from '@/i18n';

import { pluginOpAtom, startPluginOp } from '../lib/pluginOp';
import { summarizeUpdate } from '../lib/updateSummary';

export function useUpdateAllPlugins(): {
    updateAll: () => void;
    updating: boolean;
} {
    const updating = useAtomValue(pluginOpAtom) === 'updating';

    const updateAll = useCallback(() => {
        const started = startPluginOp('updating', async () =>
            summarizeUpdate(await pluginManager.updateAll()),
        );
        if (!started) {
            showToast(t('pluginManager.opInProgress'), { type: 'info' });
        }
    }, []);

    return { updateAll, updating };
}
