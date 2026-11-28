import { useCallback, useEffect, useRef, useState } from 'react';

import { clamp } from '@/utils/number';

import type { ReorderEvent } from '@/components/ui/reorderableMediaList/types';

export interface EditableListSource<T> {
    /** 进入 / 换源时取快照 */
    loadInitial(): Promise<readonly T[]>;
    /** 传完整新序、即时落库；缺席 = 不可拖 */
    reorder?: (order: readonly T[]) => Promise<void>;
}

export interface EditableList<T> {
    /** ready 渲染列表、error 渲染占位、loading 渲染骨架 */
    status: 'loading' | 'error' | 'ready';
    /** 当前条目（进入时快照，之后乐观即时写跟随） */
    items: readonly T[];
    /** 来源是否支持拖拽排序 */
    canReorder: boolean;
    /** 拖拽落定：乐观整序 + 即时落库，失败回滚并提示 */
    moveItem: (event: ReorderEvent) => void;
    /** 已在来源侧移除后，同步移出本地快照 */
    applyRemoved: (removedKeys: readonly string[]) => void;
    /** 首屏加载失败时重试 */
    retry: () => void;
}

/**
 * 可编辑列表的快照读 + 乐观即时写：进入时取一份本地副本，拖拽即时落库
 * 不订阅数据源（快照），编辑期间外部变化不打断操作
 * 序号守卫隔离并发写与换源竞态；写失败回滚到最近落库态而非可能更陈旧的乐观态
 */
export function useEditableList<T>(
    source: EditableListSource<T>,
    keyOf: (item: T) => string,
    onWriteFailed: () => void,
): EditableList<T> {
    const [items, setItems] = useState<readonly T[]>([]);
    const [status, setStatus] = useState<'loading' | 'error' | 'ready'>(
        'loading',
    );
    const [reloadToken, setReloadToken] = useState(0);
    // moveItem 读最新顺序算下一序（不进依赖，回调引用才稳定）
    const itemsRef = useRef<readonly T[]>(items);
    itemsRef.current = items;
    // 递增序号：加载与每次写各占一个；只有最新序号的异步结果能改 UI
    const seqRef = useRef(0);
    // 最近成功落库态：写失败时回滚到此
    const committedRef = useRef<readonly T[]>([]);

    useEffect(() => {
        const seq = ++seqRef.current;
        setStatus('loading');
        source
            .loadInitial()
            .then(loaded => {
                if (seq !== seqRef.current) {
                    return;
                }
                committedRef.current = loaded;
                setItems(loaded);
                setStatus('ready');
            })
            .catch(() => {
                if (seq === seqRef.current) {
                    setStatus('error');
                }
            });
    }, [source, reloadToken]);

    // key 定位（from 可能因并发过期）→ 乐观整序 → 即时落库
    // 失败仅当仍是最新写时回滚，避免迟到的失败覆盖更新的状态
    const moveItem = useCallback(
        (event: ReorderEvent) => {
            const commit = source.reorder;
            if (!commit) {
                return;
            }
            const current = itemsRef.current;
            const at = current[event.from];
            const from =
                at && keyOf(at) === event.key
                    ? event.from
                    : current.findIndex(item => keyOf(item) === event.key);
            if (from < 0) {
                return;
            }
            const to = clamp(event.to, 0, current.length - 1);
            if (from === to) {
                return;
            }
            const next = current.slice();
            const [moved] = next.splice(from, 1);
            if (!moved) {
                return;
            }
            next.splice(to, 0, moved);
            const seq = ++seqRef.current;
            setItems(next);
            commit(next)
                .then(() => {
                    committedRef.current = next;
                })
                .catch(() => {
                    if (seq !== seqRef.current) {
                        return;
                    }
                    setItems(committedRef.current);
                    onWriteFailed();
                });
        },
        [source, keyOf, onWriteFailed],
    );

    // 移除已由来源落地（含确认），此处只同步本地快照
    // UI 与落库基线各自过滤：committed 不能吞下尚未成功的乐观顺序
    const applyRemoved = useCallback(
        (removedKeys: readonly string[]) => {
            const dropped = new Set(removedKeys);
            if (dropped.size === 0) {
                return;
            }
            const keep = (item: T) => !dropped.has(keyOf(item));
            committedRef.current = committedRef.current.filter(keep);
            setItems(itemsRef.current.filter(keep));
        },
        [keyOf],
    );

    const retry = useCallback(() => setReloadToken(n => n + 1), []);

    return {
        status,
        items,
        canReorder: source.reorder != null,
        moveItem,
        applyRemoved,
        retry,
    };
}
