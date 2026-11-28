import { useNavigation } from '@react-navigation/native';
import { useCallback } from 'react';

import { showToast } from '@/components/overlay';
import {
    backup,
    classifyRestoreResult,
    type ParsedBackup,
    type RestoreBackupResult,
} from '@/core/backup';
import { useT } from '@/i18n';
import { showAlertDialog } from '@/widgets/overlays/AlertDialog';

import { endBackupOp, tryBeginBackupOp } from '../store';

import type { RestoreDecision } from '@/widgets/overlays/RestoreConfirmPanel';

/**
 * 执行恢复并如实汇报结局
 * 执行归本页而非确认面板：面板在开写前就关了，结果不依赖某个已卸载组件的回调还活着
 */
export function useRestoreBackup(): (
    parsed: ParsedBackup,
    decision: RestoreDecision,
) => Promise<void> {
    const t = useT();
    const navigation = useNavigation();

    return useCallback(
        async (parsed: ParsedBackup, decision: RestoreDecision) => {
            // 恢复不可取消：半途停下留下的是一份说不清写到哪的数据
            if (!tryBeginBackupOp('restoring', false)) {
                showToast(t('backupRestore.opInProgress'), { type: 'info' });
                return;
            }
            let result: RestoreBackupResult;
            try {
                result = await backup.restoreBackup(parsed, decision);
            } catch {
                // 逐段失败由 result 汇报，能抛到这里的是意外；写没写、写了多少都说不准
                await showAlertDialog({
                    title: t('backupRestore.restore.failedTitle'),
                    message: t('backupRestore.restore.failedMessage'),
                });
                return;
            } finally {
                endBackupOp('restoring');
            }

            if (
                classifyRestoreResult(result) === 'clean' &&
                result.localMediaIgnored === 0
            ) {
                showToast(t('backupRestore.restore.done'), { type: 'success' });
                return;
            }
            // 有遗漏或失败就进结果页：这些细节塞不进 toast，也不该被用户错过
            navigation.navigate('RestoreResult', { result });
        },
        [t, navigation],
    );
}
