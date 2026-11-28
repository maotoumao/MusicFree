/**
 * 安装结果汇总：InstallResult[] → 一条 toast（文案 + 类型）；「添加插件」与「从订阅源同步」共用
 */
import { t } from '@/i18n';

import type { PluginOpSummary } from './pluginOp';
import type { InstallFailure, InstallResult } from '@/core/plugin';
import type { TranslationKey } from '@/i18n';

type InstallOk = Extract<InstallResult, { ok: true }>;

const INSTALL_FAIL_KEY = {
    olderVersion: 'pluginManager.installResult.olderVersion',
    versionMismatch: 'pluginManager.installResult.versionMismatch',
    parseError: 'pluginManager.installResult.parseError',
    invalid: 'pluginManager.installResult.invalid',
    notPluginSource: 'pluginManager.installResult.notPluginSource',
} satisfies Record<
    Exclude<InstallFailure['reason'], 'network'>,
    TranslationKey
>;

function installFailText(fail: InstallFailure): string {
    if (fail.reason !== 'network') {
        return t(INSTALL_FAIL_KEY[fail.reason]);
    }
    switch (fail.detail?.kind) {
        case 'status':
            return t('feedback.networkErrorStatus', {
                status: fail.detail.status,
            });
        case 'timeout':
            return t('feedback.networkErrorTimedOut');
        default:
            return t('feedback.networkError');
    }
}

/** 安装汇总：生成一条 toast 文案及其类型 */
export function summarizeInstall(results: InstallResult[]): PluginOpSummary {
    // 解析出 0 个插件：无效文件/地址
    if (results.length === 0) {
        return {
            message: t('pluginManager.installResult.invalid'),
            type: 'error',
        };
    }
    const oks = results.filter((r): r is InstallOk => r.ok);
    const fails = results.filter((r): r is InstallFailure => !r.ok);
    const installed = oks.filter(o => !o.alreadyInstalled);
    const already = oks.filter(o => o.alreadyInstalled);

    // 有新装 + 有失败 → 部分成功
    if (installed.length > 0 && fails.length > 0) {
        return {
            message: t('pluginManager.installResult.partial', {
                installed: installed.length,
                failed: fails.length,
            }),
            type: 'warning',
        };
    }
    // 全部新装/更新成功
    if (installed.length > 0) {
        const [only] = installed;
        const message =
            installed.length === 1 && only
                ? t('pluginManager.installResult.installedOne', {
                      platform: only.platform,
                  })
                : t('pluginManager.installResult.installedMany', {
                      count: installed.length,
                  });
        return { message, type: 'success' };
    }
    // 无新装、无失败 → 本就已安装（同源幂等）
    if (fails.length === 0) {
        const [only] = already;
        const message =
            already.length === 1 && only
                ? t('pluginManager.installResult.alreadyInstalledOne', {
                      platform: only.platform,
                  })
                : t('pluginManager.installResult.alreadyInstalledMany', {
                      count: already.length,
                  });
        return { message, type: 'info' };
    }
    // 无新装、有失败 → 按失败汇总：原因（含网络线索）一致才用那一句，否则只说全部失败——
    // 十个插件分别 404 / 500 / 超时时写「HTTP 404」是以偏概全
    const [firstFail] = fails;
    const uniform = new Set(fails.map(f => installFailText(f))).size === 1;
    return {
        message:
            uniform && firstFail
                ? installFailText(firstFail)
                : t('pluginManager.installResult.allFailed'),
        type: 'error',
    };
}
