import { useCallback } from 'react';

import { showToast } from '@/components/overlay';
import {
    backup,
    classifyBackupFailure,
    describeBackupFailure,
    type ParseBackupSourceResult,
    type ParsedBackup,
} from '@/core/backup';
import { errorLog } from '@/core/errorLog';
import { useT } from '@/i18n';
import { pickFile } from '@/infra/documentPicker';
import { showAlertDialog } from '@/widgets/overlays/AlertDialog';
import { showTextPromptPanel } from '@/widgets/overlays/TextPromptPanel';

import { endBackupOp, tryBeginBackupOp, type BackupOpHandle } from '../store';

/** 恢复的三种来源 */
export type RestoreSource = 'file' | 'webdav' | 'url';

/** 读不成的各类结局各有各的说法，不把「地址不对」和「内容不是备份」混为一谈 */
const FAILURE_COPY = {
    notBackup: 'backupRestore.restore.notBackup',
    corrupt: 'backupRestore.restore.corrupt',
    tooLarge: 'backupRestore.restore.tooLarge',
    invalidUrl: 'backupRestore.restore.invalidUrl',
} as const;

/**
 * 选来源 → 读取解析；成功的结果交调用方复核
 * 解析绝不写入本机数据，用户确认后才 apply
 */
export function useParseBackupSource(): (
    source: RestoreSource,
) => Promise<ParsedBackup | undefined> {
    const t = useT();

    /**
     * 读文件 / 网络 / 选择器失败都属操作失败，不与「内容不是备份」混为一谈
     * 超时单独一档：报障场景正是这条路，一句笼统的「读取失败」看不出该去查什么
     * 用户自己按的取消不报——他知道自己停了
     */
    const reportFailure = useCallback(
        async (error?: unknown) => {
            const failure = classifyBackupFailure(error);
            if (failure === 'cancelled') {
                return;
            }
            errorLog.capture({
                source: 'uncaught',
                error: new Error(
                    `Backup read: ${describeBackupFailure(error)}`,
                ),
            });
            const copy =
                failure === 'timedOut'
                    ? 'backupRestore.restore.timedOut'
                    : 'backupRestore.restore.failed';
            await showAlertDialog({
                title: t(`${copy}.title`),
                message:
                    failure !== 'timedOut' && failure !== 'other'
                        ? t(`backupRestore.failure.${failure}`)
                        : t(`${copy}.message`),
            });
        },
        [t],
    );

    /**
     * 占住忙碌态跑一次读取；失败就地说明并返回 undefined
     * 抢占放在真正开跑前一刻：选文件、填地址都要等用户，占着锁没有意义
     */
    const read = useCallback(
        async (
            cancellable: boolean,
            run: (handle: BackupOpHandle) => Promise<ParseBackupSourceResult>,
        ): Promise<ParsedBackup | undefined> => {
            const handle = tryBeginBackupOp('reading', cancellable);
            if (!handle) {
                showToast(t('backupRestore.opInProgress'), { type: 'info' });
                return undefined;
            }
            try {
                const result = await run(handle);
                if (result.ok) {
                    return result;
                }
                const copy = FAILURE_COPY[result.reason];
                await showAlertDialog({
                    title: t(`${copy}.title`),
                    message: t(`${copy}.message`),
                });
            } catch (error: unknown) {
                await reportFailure(error);
            } finally {
                endBackupOp('reading');
            }
            return undefined;
        },
        [t, reportFailure],
    );

    return useCallback(
        async (source: RestoreSource) => {
            // 链接来源的读取放进面板的 onSubmit：地址填错时留在面板里改，不必重新走一遍入口
            if (source === 'url') {
                let cancelRequest: (() => void) | undefined;
                const panel = showTextPromptPanel<ParsedBackup>({
                    title: t('backupRestore.restore.urlPrompt'),
                    placeholder: t('backupRestore.restore.urlPlaceholder'),
                    confirmText: t('backupRestore.restore.urlConfirm'),
                    autoCapitalize: 'none',
                    autoCorrect: false,
                    inputMode: 'url',
                    onSubmit: async value => {
                        const parsed = await read(true, async handle => {
                            const controller = new AbortController();
                            const abort = () => controller.abort();
                            cancelRequest = abort;
                            handle.signal.addEventListener('abort', abort, {
                                once: true,
                            });
                            try {
                                if (handle.signal.aborted) {
                                    abort();
                                }
                                return await backup.parseBackupFromUrl(value, {
                                    signal: controller.signal,
                                });
                            } finally {
                                handle.signal.removeEventListener(
                                    'abort',
                                    abort,
                                );
                                if (cancelRequest === abort) {
                                    cancelRequest = undefined;
                                }
                            }
                        });
                        return parsed
                            ? { ok: true, result: parsed }
                            : { ok: false };
                    },
                });
                return panel.finally(() => cancelRequest?.());
            }

            if (source === 'webdav') {
                return read(true, handle =>
                    backup.parseBackupFromWebdav({ signal: handle.signal }),
                );
            }

            // 选文件要等用户操作，取消则静默返回
            let picked;
            try {
                picked = await pickFile({ types: ['application/json'] });
            } catch {
                // 选择器本身出错也是操作失败，不能一声不吭
                await reportFailure();
                return undefined;
            }
            // 读本机文件不接取消：react-native-fs 的读取不可中断，也不会挂在网络上
            return picked
                ? read(false, () => backup.parseBackupFile(picked.uri))
                : undefined;
        },
        [t, read, reportFailure],
    );
}
