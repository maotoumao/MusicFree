/**
 * 插件批量操作的全局忙碌态与命令式编排
 * 忙碌态仅用于页面反馈，不作为并发锁；写事务由 core/plugin 串行化
 * pluginOpAtom 为全局单例，op 脱离组件生命周期执行，完成后的 toast 通过 app 级 overlay 显示
 */
import { atom } from 'jotai';

import { showToast, type ToastOptions } from '@/components/overlay';
import { t } from '@/i18n';
import { atomStore } from '@/utils/atomStore';

/** 当前插件操作类型；null 表示空闲 */
export type PluginOpKind = 'installing' | 'updating' | 'syncing';

/** 页顶横幅据此控制显隐和文案；install/update/sync 编排负责设置和清除 */
export const pluginOpAtom = atom<PluginOpKind | null>(null);

type ToastType = NonNullable<ToastOptions['type']>;

/** 操作完成后的 toast 汇总：文案与类型 */
export interface PluginOpSummary {
    message: string;
    type: ToastType;
}

/**
 * 接管一次插件操作：已有操作进行时返回 false，由调用方反馈并保留 panel
 * 接管成功后设为 busy，脱离组件生命周期执行 op，完成后显示汇总 toast，捕获异常并在 finally 清除 busy
 */
export function startPluginOp(
    kind: PluginOpKind,
    op: () => Promise<PluginOpSummary>,
): boolean {
    if (atomStore.get(pluginOpAtom) !== null) {
        return false;
    }
    atomStore.set(pluginOpAtom, kind);
    runDetached(op).catch(() => {});
    return true;
}

async function runDetached(op: () => Promise<PluginOpSummary>): Promise<void> {
    try {
        const { message, type } = await op();
        showToast(message, { type });
    } catch {
        showToast(t('feedback.unknownError'), { type: 'error' });
    } finally {
        atomStore.set(pluginOpAtom, null);
    }
}
