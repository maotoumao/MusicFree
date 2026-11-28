/**
 * 把 data[from] 移到 to 位置，返回新数组，不改原数组
 * 越界或 from===to 时返回原数组浅拷贝，语义安全
 * 配合 ReorderableList 的 onReorder({from,to}) 落地新次序
 */
export function reorderItems<T>(
    data: readonly T[],
    from: number,
    to: number,
): T[] {
    const n = data.length;
    if (from === to || from < 0 || to < 0 || from >= n || to >= n) {
        return data.slice();
    }
    const next = data.slice();
    const [moved] = next.splice(from, 1);
    // from 已校验在 [0,n)，splice 必移除恰一个元素，as T 安全（不吞真实 undefined 元素）
    next.splice(to, 0, moved as T);
    return next;
}
