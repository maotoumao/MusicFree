import { useCallback, useMemo, useState } from 'react';

export interface SelectionMode<T> {
    /** 受控选中集；仅含当前 items 中的 key */
    selectedKeys: ReadonlySet<string>;
    /** 已选数量 */
    selectedCount: number;
    /** 当前 items 是否已全选（空列表不算） */
    allSelected: boolean;
    /** 选中项，按列表顺序 */
    selectedItems: readonly T[];
    /** 短按行切换选中 */
    toggle: (key: string) => void;
    /** 全选；已全选则清空 */
    toggleAll: () => void;
    /** 清空选中 */
    clear: () => void;
}

/**
 * 列表多选态：受控选中集 + 全选切换
 * 选中项按当前 items 过滤后对外，items 变化（删除 / 换数据源）时自动剔除失效 key
 */
export function useSelectionMode<T>(
    items: readonly T[],
    keyOf: (item: T) => string,
): SelectionMode<T> {
    const [rawKeys, setRawKeys] = useState<ReadonlySet<string>>(
        () => new Set(),
    );

    // 选中项与有效 key 同源派生：只认仍在 items 中的选中项，顺序随列表
    const selectedItems = useMemo(
        () => items.filter(item => rawKeys.has(keyOf(item))),
        // keyOf 由调用方保证稳定（模块级函数或 useCallback）
        [items, rawKeys, keyOf],
    );
    const selectedKeys = useMemo(
        () => new Set(selectedItems.map(keyOf)),
        [selectedItems, keyOf],
    );

    const toggle = useCallback((key: string) => {
        setRawKeys(prev => {
            const next = new Set(prev);
            if (!next.delete(key)) {
                next.add(key);
            }
            return next;
        });
    }, []);

    const selectedCount = selectedItems.length;
    const allSelected = items.length > 0 && selectedCount === items.length;

    const toggleAll = useCallback(() => {
        setRawKeys(allSelected ? new Set() : new Set(items.map(keyOf)));
    }, [allSelected, items, keyOf]);

    const clear = useCallback(() => setRawKeys(new Set()), []);

    return {
        selectedKeys,
        selectedCount,
        allSelected,
        selectedItems,
        toggle,
        toggleAll,
        clear,
    };
}
