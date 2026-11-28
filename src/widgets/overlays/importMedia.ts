/**
 * 插件导入编排：输 URL（带该插件格式提示）→ importMusicItem/importPlaylist → 加入歌单
 * 两入口：已定插件走 promptImportMedia；未定走 promptImportFromLibrary 先选插件
 */
import { showToast } from '@/components/overlay';
import { pluginManager } from '@/core/plugin';
import { t } from '@/i18n';
import { showActionSheetPanel } from '@/widgets/overlays/ActionSheetPanel';
import { showAddToPlaylistPanel } from '@/widgets/overlays/AddToPlaylistPanel';
import { showTextPromptPanel } from '@/widgets/overlays/TextPromptPanel';

import type { Plugin } from '@/core/plugin';
import type { MusicItem } from '@/types';

/** 导入类型：单曲 / 歌单 */
export type ImportKind = 'music' | 'playlist';

/** 格式提示防御上限：插件 hints 不可信，限条数与单条长度 */
const MAX_HINTS = 8;
const MAX_HINT_LENGTH = 200;

/**
 * 从插件 definition.hints 取该类型的格式提示（不可信边界，做防御）
 * 歌单兼容 legacy key importMusicSheet 与新名 importPlaylist；非法/超量一律丢弃
 */
function readHints(
    plugin: Plugin,
    kind: ImportKind,
): readonly string[] | undefined {
    let raw: unknown;
    try {
        const hints = plugin.definition?.hints;
        raw =
            kind === 'music'
                ? hints?.importMusicItem
                : hints?.importPlaylist ?? hints?.importMusicSheet;
    } catch {
        return undefined;
    }
    if (!Array.isArray(raw)) {
        return undefined;
    }
    const cleaned = raw
        .filter(
            (h): h is string => typeof h === 'string' && h.trim().length > 0,
        )
        .slice(0, MAX_HINTS)
        .map(h =>
            h.length > MAX_HINT_LENGTH ? h.slice(0, MAX_HINT_LENGTH) : h,
        );
    return cleaned.length > 0 ? cleaned : undefined;
}

/** 调该插件对应导入方法，整形为 MusicItem[]（单曲包成一元数组） */
async function runImport(
    plugin: Plugin,
    kind: ImportKind,
    url: string,
): Promise<MusicItem[] | null> {
    if (kind === 'music') {
        const item = await plugin.methods.importMusicItem(url);
        return item ? [item] : null;
    }
    return plugin.methods.importPlaylist(url);
}

/**
 * 已定插件导入：输 URL（带该插件格式提示）→ 解析 → 结果加入歌单
 * 解析失败 / 空结果 → toast 并保留输入面板
 */
export async function promptImportMedia(
    plugin: Plugin,
    kind: ImportKind,
): Promise<void> {
    const method = kind === 'music' ? 'importMusicItem' : 'importPlaylist';
    if (!plugin.supportedMethods.has(method)) {
        showToast(t('importMedia.noPlugin'), { type: 'info' });
        return;
    }
    // hints 与方法调用都要求 ready；load 失败或版本不符则导入必失败，提前止损
    try {
        await plugin.load();
    } catch {
        // parseError：下方 state 检查统一拦
    }
    if (plugin.state !== 'ready') {
        showToast(t('importMedia.pluginUnavailable'), { type: 'error' });
        return;
    }
    const hints = readHints(plugin, kind);
    const items = await showTextPromptPanel<readonly MusicItem[]>({
        title: t(
            kind === 'music' ? 'importMedia.music' : 'importMedia.playlist',
        ),
        placeholder: t('importMedia.placeholder'),
        hints,
        autoCapitalize: 'none',
        autoCorrect: false,
        inputMode: 'url',
        onSubmit: async raw => {
            const url = raw.trim();
            if (!url) {
                return { ok: false };
            }
            let result: MusicItem[] | null;
            try {
                result = await runImport(plugin, kind, url);
            } catch {
                showToast(t('importMedia.failed'), { type: 'error' });
                return { ok: false };
            }
            if (!result || result.length === 0) {
                showToast(t('importMedia.empty'), { type: 'info' });
                return { ok: false };
            }
            return { ok: true, result };
        },
    });
    if (items && items.length > 0) {
        await showAddToPlaylistPanel({ items });
    }
}

/**
 * 未定插件导入：从已启用且有序的插件中筛支持该导入的 → 0 无 / 1 直接用 / 多先选 → promptImportMedia
 */
export function promptImportMediaFromPlugins(kind: ImportKind): void {
    const method = kind === 'music' ? 'importMusicItem' : 'importPlaylist';
    const plugins = pluginManager
        .getOrder()
        .map(platform => pluginManager.getByPlatform(platform))
        .filter(
            (p): p is Plugin =>
                p !== undefined &&
                pluginManager.isEnabled(p.platform) &&
                p.supportedMethods.has(method),
        );
    const [first] = plugins;
    if (!first) {
        showToast(t('importMedia.noPlugin'), { type: 'info' });
        return;
    }
    if (plugins.length === 1) {
        promptImportMedia(first, kind).catch(() => {});
        return;
    }
    showActionSheetPanel({
        title: t('importMedia.selectPlugin'),
        items: plugins.map(p => ({
            label: p.platform,
            onPress: () => promptImportMedia(p, kind).catch(() => {}),
        })),
    });
}
