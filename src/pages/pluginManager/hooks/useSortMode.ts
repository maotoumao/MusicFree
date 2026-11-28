/**
 * 排序模式编排 hook：进入时复制当前顺序，置顶、上移、下移只修改草稿
 * 确认时才通过 setOrder 保存，取消或系统返回则丢弃草稿；列表继续使用 FlashList，不做重排动画
 */
import { usePreventRemove } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { pluginManager } from '@/core/plugin';
import { t } from '@/i18n';

import type { Plugin } from '@/core/plugin';

/** 单步移动方向 */
export type MoveOp = 'top' | 'up' | 'down';

export function useSortMode(plugins: Plugin[]): {
    sorting: boolean;
    /** 按草稿顺序排列的插件列表，供渲染使用 */
    orderedPlugins: Plugin[];
    enter: () => void;
    confirm: () => void;
    cancel: () => void;
    move: (platform: string, op: MoveOp) => void;
} {
    const [sorting, setSorting] = useState(false);
    const [draftOrder, setDraftOrder] = useState<string[]>([]);

    const enter = useCallback(() => {
        setDraftOrder(plugins.map(p => p.platform));
        setSorting(true);
        // AppBar 和列表整体替换，显式通知读屏模式切换
        AccessibilityInfo.announceForAccessibility(
            t('pluginManager.sorting.a11y.entered'),
        );
    }, [plugins]);

    const confirm = useCallback(() => {
        pluginManager.setOrder(draftOrder);
        setSorting(false);
    }, [draftOrder]);

    const cancel = useCallback(() => setSorting(false), []);

    const move = useCallback((platform: string, op: MoveOp) => {
        setDraftOrder(prev => reorder(prev, platform, op));
    }, []);

    // 排序态拦截离开页面的动作（Android 返回、iOS 侧滑和父导航移除），统一退出排序而不离开页面
    usePreventRemove(sorting, cancel);

    const byPlatform = useMemo(
        () => new Map(plugins.map(p => [p.platform, p])),
        [plugins],
    );
    const orderedPlugins = useMemo(
        () =>
            draftOrder
                .map(platform => byPlatform.get(platform))
                .filter((p): p is Plugin => p !== undefined),
        [draftOrder, byPlatform],
    );

    return { sorting, orderedPlugins, enter, confirm, cancel, move };
}

/** 将指定 platform 移到目标位置；platform 不存在时返回原数组 */
function reorder(order: string[], platform: string, op: MoveOp): string[] {
    const from = order.indexOf(platform);
    if (from < 0) {
        return order;
    }
    const to = op === 'top' ? 0 : op === 'up' ? from - 1 : from + 1;
    // 首项上移或末项下移会越界，返回原数组以防止 disabled 状态之外的竞态点击
    if (to < 0 || to >= order.length) {
        return order;
    }
    const next = [...order];
    next.splice(from, 1);
    next.splice(to, 0, platform);
    return next;
}
