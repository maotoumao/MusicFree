/**
 * 搜索历史持久化：MMKV store 'search' / key 'history-search'（沿用 legacy 键名与形状）
 * 值 = string[]，最新在前、去重；读出规范化（防脏数据），写 best-effort（不阻断搜索）
 */
import { useMemo } from 'react';
import { useMMKVString } from 'react-native-mmkv';

import { getObject, getOrCreateMMKV, setObject } from '@/infra/storage';
import { safeParse } from '@/utils/json';

/** 搜索页 MMKV store（页级持久化，独立命名空间） */
const searchStore = getOrCreateMMKV('search');
/** 历史 key：沿用 legacy 键名（wire 冻结，勿改） */
const HISTORY_KEY = 'history-search';
/** 历史条数上限：超出截断 */
const MAX_HISTORY = 20;

/** 把持久化值（可能脏）规范化成干净历史：非空字符串、去重、截断上限 */
function normalizeHistory(raw: unknown): string[] {
    if (!Array.isArray(raw)) {
        return [];
    }
    const out: string[] = [];
    for (const item of raw) {
        if (typeof item === 'string' && item !== '' && !out.includes(item)) {
            out.push(item);
        }
        if (out.length >= MAX_HISTORY) {
            break;
        }
    }
    return out;
}

function readHistory(): string[] {
    return normalizeHistory(getObject<unknown>(searchStore, HISTORY_KEY));
}

/** 记一条搜索历史：trim 非空、去重置顶、截断上限；写失败静默（历史次要，不阻断搜索） */
export function addSearchHistory(query: string): void {
    const q = query.trim();
    if (!q) {
        return;
    }
    try {
        const next = [q, ...readHistory().filter(item => item !== q)].slice(
            0,
            MAX_HISTORY,
        );
        setObject(searchStore, HISTORY_KEY, next);
    } catch {
        // 历史是次要功能，写失败不影响搜索提交
    }
}

/** 清空搜索历史；写失败静默 */
export function clearSearchHistory(): void {
    try {
        setObject(searchStore, HISTORY_KEY, []);
    } catch {
        // best-effort
    }
}

/** 删除一条搜索历史；目标不存在或写失败时静默 */
export function removeSearchHistory(query: string): void {
    try {
        const history = readHistory();
        const next = history.filter(item => item !== query);
        if (next.length !== history.length) {
            setObject(searchStore, HISTORY_KEY, next);
        }
    } catch {
        // best-effort
    }
}

/** 反应式读搜索历史（最新在前、已规范化）；写经本文件的增删方法 */
export function useSearchHistory(): string[] {
    const [raw] = useMMKVString(HISTORY_KEY, searchStore);
    return useMemo(() => normalizeHistory(safeParse(raw)), [raw]);
}
