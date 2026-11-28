/**
 * 恢复引擎：把 canonical sections apply 到各 core 端口
 * 端口只守机制（原子性 / 去重 / 发新 id），本层负责判断——本地曲门控、缺段 vs 空段、逐段错误隔离
 */
import { isLocalPlatform } from '@/utils/media';

import type {
    BackupRestoreMode,
    BackupSections,
    BackupSettings,
    RestoreBackupResult,
    RestoreSectionOutcome,
    SettingsRestoreResult,
} from './types';
import type { ConfigKey, IConfig } from '@/core/config';
import type {
    IMediaMetaTransfer,
    MediaMetaRestoreResult,
    MediaMetaTransferItem,
} from '@/core/mediaMeta';
import type {
    ILocalPlaylistTransfer,
    IStarredTransfer,
    LocalPlaylistRestoreResult,
    LocalPlaylistTransferItem,
    StarredPlaylist,
    StarredPlaylistRestoreResult,
} from '@/core/playlist';
import type {
    IPluginTransfer,
    PluginsRestoreResult,
    PluginsTransfer,
} from '@/core/plugin';
import type { DeepReadonly } from '@/types';

/** 端口错误 → 稳定码 + 展示文本；PlaylistOperationError 等带 code 的优先取码 */
function describeError(error: unknown): {
    errorCode?: string;
    message: string;
} {
    if (error instanceof Error) {
        const { code } = error as Error & { code?: unknown };
        return {
            ...(typeof code === 'string' ? { errorCode: code } : {}),
            message: error.message,
        };
    }
    return { message: String(error) };
}

/**
 * 恢复结局的整体判定
 * clean = 该进来的都进来了；partial = 有内容没进来；allFailed = 有段失败且没有任何一段成功
 * 分流与结果页标题共用此判定，避免两处各写一套「算不算成功」
 * 判为「没进来」的只有真正的内容损失：段失败、插件装不上、歌曲非法被丢
 * 去重跳过、白名单外的设置、无纳入字段的 mediaMeta 都是预期内的，逐段计数里照报，但不升级为异常结局
 */
export function classifyRestoreResult(
    result: RestoreBackupResult,
): 'clean' | 'partial' | 'allFailed' {
    const outcomes: RestoreSectionOutcome<unknown>[] = [
        result.musicSheets,
        result.starredPlaylists,
        result.plugins,
        result.mediaMeta,
        result.settings,
    ];
    const anyFailed = outcomes.some(outcome => outcome.status === 'failed');
    if (anyFailed && !outcomes.some(outcome => outcome.status === 'ok')) {
        return 'allFailed';
    }
    const lostContent =
        anyFailed ||
        (result.plugins.status === 'ok' &&
            result.plugins.counts.pluginInstallFailures.length > 0) ||
        (result.musicSheets.status === 'ok' &&
            result.musicSheets.counts.invalidMusicSkipped > 0);
    return lostContent ? 'partial' : 'clean';
}

/**
 * 本地曲门控：非「同一安装」时整批剔除本地平台的媒体引用（跨设备文件必然不可用，免逐条查盘）
 * 覆盖歌单曲目、收藏内嵌曲目、mediaMeta 记录及其关联歌词来源
 * localMediaIgnored 按**被剔除的本地引用条数**计：同一条 mediaMeta 若目标与关联来源都是本地则计 2
 * 同一安装时原样返回，不做任何拷贝
 */
export function gateLocalMedia(
    sections: BackupSections,
    sameInstallation: boolean,
): { sections: BackupSections; localMediaIgnored: number } {
    if (sameInstallation) {
        return { sections, localMediaIgnored: 0 };
    }
    let ignored = 0;

    const musicSheets = sections.musicSheets?.map(sheet => {
        const kept = sheet.musicList.filter(
            music => !isLocalPlatform(music.platform),
        );
        if (kept.length === sheet.musicList.length) {
            return sheet;
        }
        ignored += sheet.musicList.length - kept.length;
        return { ...sheet, musicList: kept };
    });

    const starredPlaylists = sections.starredPlaylists?.map(starred => {
        if (!starred.musicList) {
            return starred;
        }
        const kept = starred.musicList.filter(
            music => !isLocalPlatform(music.platform),
        );
        if (kept.length === starred.musicList.length) {
            return starred;
        }
        ignored += starred.musicList.length - kept.length;
        return { ...starred, musicList: kept };
    });

    // mediaMeta 一次遍历：目标本地 → 整条剔除；关联歌词来源本地 → 摘掉关联，
    // 若同条没有 lyricOffset 则已无纳入字段可留、整条剔除（避免留下空记录被端口再计一次 skipped）
    const mediaMeta = sections.mediaMeta?.flatMap(entry => {
        const sourceLocal = entry.associatedLyric
            ? isLocalPlatform(entry.associatedLyric.musicItem.platform)
            : false;
        if (sourceLocal) {
            ignored += 1;
        }
        if (isLocalPlatform(entry.platform)) {
            ignored += 1;
            return [];
        }
        if (!sourceLocal) {
            return [entry];
        }
        return entry.lyricOffset !== undefined
            ? [
                  {
                      platform: entry.platform,
                      id: entry.id,
                      lyricOffset: entry.lyricOffset,
                  },
              ]
            : [];
    });

    return {
        sections: {
            ...sections,
            ...(musicSheets !== undefined ? { musicSheets } : {}),
            ...(starredPlaylists !== undefined ? { starredPlaylists } : {}),
            ...(mediaMeta !== undefined ? { mediaMeta } : {}),
        },
        localMediaIgnored: ignored,
    };
}

/** 恢复 musicSheets 段：缺段恒 no-op；端口保证段级 all-or-nothing */
export async function restoreMusicSheetsSection(
    port: ILocalPlaylistTransfer,
    sheets: readonly DeepReadonly<LocalPlaylistTransferItem>[] | undefined,
    mode: BackupRestoreMode,
): Promise<RestoreSectionOutcome<LocalPlaylistRestoreResult>> {
    if (sheets === undefined) {
        return { status: 'skipped', reason: 'absent' };
    }
    try {
        return {
            status: 'ok',
            counts: await port.restoreLocalPlaylists(sheets, mode),
        };
    } catch (error) {
        return { status: 'failed', ...describeError(error) };
    }
}

/** 恢复 starredPlaylists 段：缺段恒 no-op；空数组在 overwrite 下即清空全部收藏 */
export async function restoreStarredPlaylistsSection(
    port: IStarredTransfer,
    starred: readonly StarredPlaylist[] | undefined,
    mode: BackupRestoreMode,
): Promise<RestoreSectionOutcome<StarredPlaylistRestoreResult>> {
    if (starred === undefined) {
        return { status: 'skipped', reason: 'absent' };
    }
    try {
        return {
            status: 'ok',
            counts: await port.restoreStarredPlaylists(starred, mode),
        };
    } catch (error) {
        return { status: 'failed', ...describeError(error) };
    }
}

/**
 * 恢复 plugins 段：恒增量、不看模式；端口内部条目级 best-effort，整体失败才算段失败
 * 空段直接 no-op——协议要求空段在任何模式下都不动插件，而端口入口会等待就绪并检查对账，
 * 无内容时不该为此阻塞或因对账失败把整段判失败
 */
export async function restorePluginsSection(
    port: IPluginTransfer,
    plugins: PluginsTransfer | undefined,
): Promise<RestoreSectionOutcome<PluginsRestoreResult>> {
    if (plugins === undefined) {
        return { status: 'skipped', reason: 'absent' };
    }
    if (
        plugins.installed.length === 0 &&
        plugins.subscriptions.length === 0 &&
        plugins.alternatives.length === 0
    ) {
        return {
            status: 'ok',
            counts: {
                pluginsInstalled: 0,
                pluginsSkipped: 0,
                pluginInstallFailures: [],
                subscriptionsAdded: 0,
                subscriptionsSkipped: 0,
                alternativesAdded: 0,
                alternativesSkipped: 0,
            },
        };
    }
    try {
        return { status: 'ok', counts: await port.restorePlugins(plugins) };
    } catch (error) {
        return { status: 'failed', ...describeError(error) };
    }
}

/** 恢复 mediaMeta 段：恒字段级 upsert、不看模式、不随 overwrite 清空 */
export function restoreMediaMetaSection(
    port: IMediaMetaTransfer,
    items: readonly MediaMetaTransferItem[] | undefined,
): RestoreSectionOutcome<MediaMetaRestoreResult> {
    if (items === undefined) {
        return { status: 'skipped', reason: 'absent' };
    }
    try {
        return { status: 'ok', counts: port.restoreMediaMeta(items) };
    } catch (error) {
        return { status: 'failed', ...describeError(error) };
    }
}

/**
 * 恢复 settings 段：恒 upsert 白名单键
 * 备份里的值不可信（解析层只保证 values 是对象），故逐键交 config 按其值域（枚举 / 范围 / 格式）校验，
 * 不合值域即跳过——避免把非法值写进 config 后污染 UI
 */
export function restoreSettingsSection(
    config: IConfig,
    settings: BackupSettings | undefined,
    whitelist: readonly ConfigKey[],
): RestoreSectionOutcome<SettingsRestoreResult> {
    if (settings === undefined) {
        return { status: 'skipped', reason: 'absent' };
    }
    let applied = 0;
    let skipped = 0;
    try {
        for (const [key, value] of Object.entries(settings.values)) {
            const configKey = whitelist.find(allowed => allowed === key);
            if (configKey === undefined || !config.isValid(configKey, value)) {
                skipped += 1;
                continue;
            }
            config.set(configKey, value);
            applied += 1;
        }
    } catch (error) {
        return { status: 'failed', ...describeError(error) };
    }
    return { status: 'ok', counts: { applied, skipped } };
}
