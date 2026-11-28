/**
 * 集合内歌曲搜索的纯过滤逻辑
 * 预计算每首的可搜文本（原文 + 全拼 + 拼音首字母），查询期做多词 AND 子串匹配
 */
import type { MusicItem } from '@/types';

/** 单字段可搜文本长度上限：插件 DTO 不可信，超长先截断再转拼音，给每项工作量封顶 */
const MAX_FIELD_LEN = 256;

/** 一首歌的搜索索引条目：item 原样透传，searchTexts 为各可搜文本（原文/全拼/首字母，均小写） */
export interface SearchIndexEntry {
    item: MusicItem;
    searchTexts: readonly string[];
}

/** 取字符串字段并截断到上限，非字符串（插件 DTO 不可信）一律视为空 */
function field(value: unknown): string {
    return typeof value === 'string' ? value.slice(0, MAX_FIELD_LEN) : '';
}

// pinyin-pro 入口含大字典（模块求值时建查找表），懒加载到首次实际搜索才付出成本；未进搜索页不加载
type PinyinFn = typeof import('pinyin-pro').pinyin;
let pinyinFn: PinyinFn | undefined;
function loadPinyin(): PinyinFn {
    // require 到首次调用才执行，字典不在启动时求值
    pinyinFn ??= (require('pinyin-pro') as typeof import('pinyin-pro')).pinyin;
    return pinyinFn;
}

/** 汉字转全拼（无声调、ü→v、非汉字原样保留、无间距拼接） */
function toFullPinyin(text: string): string {
    if (!text) {
        return '';
    }
    return loadPinyin()(text, {
        toneType: 'none',
        type: 'array',
        nonZh: 'consecutive',
        v: true,
    }).join('');
}

/** 汉字转拼音首字母（非汉字原样保留） */
function toPinyinInitials(text: string): string {
    if (!text) {
        return '';
    }
    return loadPinyin()(text, {
        pattern: 'first',
        toneType: 'none',
        type: 'array',
        nonZh: 'consecutive',
        v: true,
    }).join('');
}

/** 预计算一首歌的可搜文本（原文/全拼/首字母，均小写、分别独立匹配） */
function buildEntry(item: MusicItem): SearchIndexEntry {
    const fields = `${field(item.title)} ${field(item.artist)} ${field(
        item.album,
    )}`;
    const searchTexts = [
        fields.toLowerCase(),
        toFullPinyin(fields).toLowerCase(),
        toPinyinInitials(fields).toLowerCase(),
    ];
    return { item, searchTexts };
}

/** 预计算整份列表的搜索索引（一次性，随列表变化重算即可） */
export function buildSearchIndex(
    list: readonly MusicItem[],
): SearchIndexEntry[] {
    return list.map(buildEntry);
}

/**
 * 按查询过滤：空查询返回全部；否则按空格分词、逐词必中（AND），每词命中任一可搜文本即可
 * 保持原列表顺序：播放按原完整列表定位，过滤需稳定保序
 */
export function filterMusicList(
    index: readonly SearchIndexEntry[],
    query: string,
): MusicItem[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
        return index.map(entry => entry.item);
    }
    const tokens = normalized.split(/\s+/);
    return index
        .filter(entry =>
            tokens.every(token =>
                entry.searchTexts.some(text => text.includes(token)),
            ),
        )
        .map(entry => entry.item);
}
