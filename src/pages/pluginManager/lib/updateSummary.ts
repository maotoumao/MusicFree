/**
 * 更新结果汇总：InstallResult[] → 一条 toast（文案 + 类型）；「全部更新」与「更新所选」共用
 */
import { t } from '@/i18n';

import type { PluginOpSummary } from './pluginOp';
import type { InstallResult } from '@/core/plugin';

type InstallOk = Extract<InstallResult, { ok: true }>;

/** 更新结果 → 一条汇总 toast（已更新 / 已最新 / 部分 / 失败 / 空） */
export function summarizeUpdate(results: InstallResult[]): PluginOpSummary {
    // 被卸载打断的更新按「未发生」剔除，不计入更新 / 失败
    const relevant = results.filter(r => !(r.ok && r.skipped));
    // 没有可更新插件（无 srcUrl / 空列表 / 全部被跳过）
    if (relevant.length === 0) {
        return { message: t('pluginManager.updateResult.empty'), type: 'info' };
    }
    const oks = relevant.filter((r): r is InstallOk => r.ok);
    const failed = relevant.length - oks.length;
    const updated = oks.filter(o => !o.alreadyInstalled).length;

    // 全部失败
    if (failed === relevant.length) {
        return {
            message: t('pluginManager.updateResult.allFailed'),
            type: 'error',
        };
    }
    // 有失败但非全部 → 部分成功（updated 可能为 0，即余下都已是最新）
    if (failed > 0) {
        return {
            message: t('pluginManager.updateResult.partial', {
                updated,
                failed,
            }),
            type: 'warning',
        };
    }
    // 无失败：有更新 / 全部已最新
    if (updated > 0) {
        return {
            message: t('pluginManager.updateResult.updated', {
                count: updated,
            }),
            type: 'success',
        };
    }
    return { message: t('pluginManager.updateResult.allLatest'), type: 'info' };
}
