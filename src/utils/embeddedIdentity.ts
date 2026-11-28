/**
 * 文件自带的身份声明：写进音频文件自定义 tag `MF_MUSICITEM` 的版本化 MusicItem
 *
 * 让媒体身份随文件走——扫描读回它，就能把一个音频文件认成「来自某插件的某首歌」，
 * 而不是只按路径派生一个本地身份。谁写的这份声明本模块不关心（当前是下载，将来可能是导入）。
 *
 * **默认保留全部字段**，与备份协议对 MusicItem 的口径一致：插件私有字段（`hash` / `songmid` /
 * `copyrightId` 之类的目录标识）正是插件日后重新检索音源的依据，裁掉它们等于让文件永久失去可解析性。
 *
 * `MF_MUSICITEM` 与其中的 JSON 字段名是写进用户文件的 wire 契约：
 * 只能新增字段或升版本，不能改已有字段的含义。
 */
import { safeParse, safeStringify } from '@/utils/json';
import { coerceMusicItem } from '@/utils/media';

import type { DeepReadonly, MusicItem } from '@/types';

/** 声明 schema 版本；读侧认不出即整份拒绝，不做尽力解析 */
const VERSION = 1;

/** JSON 预算：文件可被外部篡改成超大 tag，限长避免扫描时解析 / 拷贝卡顿 */
export const MAX_EMBEDDED_IDENTITY_CHARS = 8192;

/** 歌词：体积可达数十 KB 且随时可重取，写进文件只会撑爆预算——永不写入 */
const LYRIC_FIELDS: readonly string[] = ['lyric', 'lrc', 'rawLrc'];

/** 音源缓存：签名且限时，读回来时必然已过期，故预算不足时第一个牺牲 */
const SOURCE_FIELDS: readonly string[] = ['url', 'source', 'qualities'];

/**
 * MusicItem → 声明 JSON；超预算或不可序列化返回 undefined（此时文件不写该 tag，照常发布）
 *
 * 超预算时先牺牲音源缓存再试一次：身份远比一份注定过期的 URL 重要，
 * 不能因为音源字段太大就让整个文件失去来源身份、退化成普通本地音乐
 */
export function encodeEmbeddedIdentity(
    item: DeepReadonly<MusicItem>,
): string | undefined {
    return (
        declare(item, LYRIC_FIELDS) ??
        declare(item, [...LYRIC_FIELDS, ...SOURCE_FIELDS])
    );
}

/** 按给定剔除集生成声明；超预算或不可序列化返回 undefined */
function declare(
    item: DeepReadonly<MusicItem>,
    dropped: readonly string[],
): string | undefined {
    const text = safeStringify({ v: VERSION, item: keep(item, dropped) });
    return text !== undefined && text.length <= MAX_EMBEDDED_IDENTITY_CHARS
        ? text
        : undefined;
}

/**
 * 声明 JSON → MusicItem；格式非法 / 版本不认识 / 超预算返回 undefined
 * 写入方是本 App，但文件位于用户可访问目录、可被任意 app 篡改，故按不可信输入校验并限长
 */
export function parseEmbeddedIdentity(raw: string): MusicItem | undefined {
    if (!raw || raw.length > MAX_EMBEDDED_IDENTITY_CHARS) return undefined;
    const parsed: unknown = safeParse(raw);
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const declaration = parsed as Record<string, unknown>;
    if (declaration.v !== VERSION) return undefined;
    const item = coerceMusicItem(declaration.item);
    if (!item) return undefined;
    // 读侧再剔一遍：只在写侧过滤挡不住被篡改的文件
    const restored = keep(item, LYRIC_FIELDS);
    restored.platform = item.platform;
    restored.id = item.id;
    coerceDeclaredTypes(restored);
    return restored as unknown as MusicItem;
}

/** 拷出保留字段：剔除给定字段与顶层 `$` 内部键（嵌套层的 `$` 是插件合法数据，不动） */
function keep(
    item: DeepReadonly<MusicItem>,
    dropped: readonly string[],
): Record<string, unknown> {
    const source = item as unknown as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source)) {
        if (key.startsWith('$') || dropped.includes(key)) continue;
        result[key] = source[key];
    }
    return result;
}

/**
 * 把本 App 的 DTO 里声明过类型的字段收敛到该类型；插件私有字段原样透传
 * 被篡改的文件可能让 `title` 是个对象，直接流进 React 文本节点会崩
 */
function coerceDeclaredTypes(item: Record<string, unknown>): void {
    item.title = plaintext(item.title);
    item.artist = plaintext(item.artist);
    item.album = plaintext(item.album);
    item.artwork = plaintext(item.artwork);
    item.duration = seconds(item.duration);
    for (const key of ['url', 'alias']) {
        if (item[key] !== undefined && typeof item[key] !== 'string') {
            delete item[key];
        }
    }
}

function plaintext(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function seconds(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? value
        : 0;
}
