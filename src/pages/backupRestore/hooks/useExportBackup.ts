import { useCallback } from 'react';
import { Platform } from 'react-native';

import { showToast } from '@/components/overlay';
import {
    backup,
    classifyBackupFailure,
    describeBackupFailure,
    type BackupExportResult,
} from '@/core/backup';
import { errorLog } from '@/core/errorLog';
import { useT } from '@/i18n';
import {
    openStorageSettings,
    requestStorageWriteAccess,
} from '@/infra/permission';
import { showAlertDialog } from '@/widgets/overlays/AlertDialog';
import { showConfirmDialog } from '@/widgets/overlays/ConfirmDialog';

import { endBackupOp, tryBeginBackupOp } from '../store';

import type { BackupExportDecision } from '@/widgets/overlays/BackupExportPanel';

/**
 * Android 9 及以下直写公共下载目录，需运行时存储权限
 * 10 起走 MediaStore 免权限——那时切不可调通用写权限门面，它在 11+ 会去要「全文件访问」，为导出备份要这个太重
 */
const NEEDS_LEGACY_STORAGE_PERMISSION =
    Platform.OS === 'android' && Number(Platform.Version) < 29;

/** 返回 true 表示可以继续导出 */
async function ensureLegacyStoragePermission(
    t: ReturnType<typeof useT>,
): Promise<boolean> {
    if (!NEEDS_LEGACY_STORAGE_PERMISSION) {
        return true;
    }
    const status = await requestStorageWriteAccess();
    if (status === 'granted') {
        return true;
    }
    if (status === 'blocked') {
        // 永久拒绝后弹窗里没法再授予，只能引到系统设置
        const toSettings = await showConfirmDialog({
            title: t('backupRestore.export.storagePermissionBlocked.title'),
            message: t('backupRestore.export.storagePermissionBlocked.message'),
            confirmText: t(
                'backupRestore.export.storagePermissionBlocked.confirm',
            ),
        });
        if (toSettings) {
            await openStorageSettings();
        }
        return false;
    }
    showToast(t('backupRestore.export.needStoragePermission'), {
        type: 'info',
    });
    return false;
}

/**
 * 导出备份到指定目的地
 * 操作脱离组件生命周期执行：中途离开本页不会打断导出，结果经 app 级 overlay 反馈
 */
export function useExportBackup(): (decision: BackupExportDecision) => void {
    const t = useT();

    const exportTo = useCallback(
        ({ destination, selection }: BackupExportDecision) => {
            // 只有 WebDAV 那条把 signal 交了下去；写本机下载目录接不上取消
            const handle = tryBeginBackupOp(
                'exporting',
                destination === 'webdav',
            );
            if (!handle) {
                showToast(t('backupRestore.opInProgress'), { type: 'info' });
                return;
            }
            // 先过权限再动工，免得白跑一遍快照与落盘最后卡在授权上
            const gate =
                destination === 'downloads'
                    ? ensureLegacyStoragePermission(t)
                    : Promise.resolve(true);
            gate.then(async allowed => {
                if (!allowed) {
                    return;
                }
                const result: BackupExportResult =
                    destination === 'downloads'
                        ? await backup.exportBackupToDownloads(selection)
                        : await backup.exportBackupToWebdav(selection, {
                              signal: handle.signal,
                          });
                if (!result.exceedsInteropGuarantee) {
                    showToast(
                        t(
                            destination === 'downloads'
                                ? 'backupRestore.export.savedToDownloads'
                                : 'backupRestore.export.savedToWebdav',
                        ),
                        { type: 'success' },
                    );
                    return;
                }
                // 导出成功但对端可能读不了：这条得让用户真正看到，不塞进一闪而过的 toast
                await showAlertDialog({
                    title: t('backupRestore.export.interopWarning.title'),
                    message: t('backupRestore.export.interopWarning.message'),
                });
            })
                .catch((error: unknown) => {
                    const failure = classifyBackupFailure(error);
                    // 用户自己按的取消不是失败，不必再报一遍
                    if (failure === 'cancelled') {
                        return;
                    }
                    errorLog.capture({
                        source: 'uncaught',
                        error: new Error(
                            `Backup export (${destination}): ${describeBackupFailure(
                                error,
                            )}`,
                        ),
                    });
                    // 超时要说清是服务器没回，否则「稍后再试」会让人一直重试同一个死地址
                    showToast(
                        failure !== 'timedOut' && failure !== 'other'
                            ? t(`backupRestore.failure.${failure}`)
                            : t(
                                  failure === 'timedOut'
                                      ? 'backupRestore.export.timedOut'
                                      : 'backupRestore.export.failed',
                              ),
                        { type: 'error' },
                    );
                })
                .finally(() => {
                    endBackupOp('exporting');
                });
        },
        [t],
    );

    return exportTo;
}
