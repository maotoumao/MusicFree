/**
 * 多选模式编排 hook：进入时可预选一项，toggle 单项 / toggleAll 全选切换维护选中集合
 * 退出或系统返回清空选择；批量卸载走确认框，批量更新复用「全部更新」的结果汇总
 */
import { usePreventRemove } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { showToast } from '@/components/overlay';
import { pluginManager } from '@/core/plugin';
import { t } from '@/i18n';
import { atomStore } from '@/utils/atomStore';
import { showConfirmDialog } from '@/widgets/overlays/ConfirmDialog';

import { pluginOpAtom, startPluginOp } from '../lib/pluginOp';
import { summarizeUpdate } from '../lib/updateSummary';

import type { Plugin } from '@/core/plugin';

export function useSelectMode(plugins: Plugin[]): {
    selecting: boolean;
    /** 选中的 platform 集合，供行高亮与计数 */
    selected: ReadonlySet<string>;
    /** 是否已全选，供「全选 / 取消全选」切换与 a11y 标签 */
    allSelected: boolean;
    enter: (preselect?: string) => void;
    exit: () => void;
    toggle: (platform: string) => void;
    toggleAll: () => void;
    uninstallSelected: () => void;
    updateSelected: () => void;
} {
    const [selecting, setSelecting] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const enter = useCallback((preselect?: string) => {
        setSelected(preselect ? new Set([preselect]) : new Set());
        setSelecting(true);
        // AppBar 和列表整体替换，显式通知读屏模式切换
        AccessibilityInfo.announceForAccessibility(
            t('pluginManager.selecting.a11y.entered'),
        );
    }, []);

    const exit = useCallback(() => {
        setSelecting(false);
        setSelected(new Set());
    }, []);

    const toggle = useCallback((platform: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(platform)) {
                next.delete(platform);
            } else {
                next.add(platform);
            }
            return next;
        });
    }, []);

    // 已全选则再次点击清空，否则选中全部
    const allSelected =
        plugins.length > 0 && plugins.every(p => selected.has(p.platform));
    const toggleAll = useCallback(() => {
        setSelected(prev =>
            plugins.length > 0 && plugins.every(p => prev.has(p.platform))
                ? new Set()
                : new Set(plugins.map(p => p.platform)),
        );
    }, [plugins]);

    // 多选态拦截离开页面的动作（Android 返回、iOS 侧滑和父导航移除），统一退出多选而不离开页面
    usePreventRemove(selecting, exit);

    const uninstallSelected = useCallback(() => {
        const platforms = [...selected];
        if (platforms.length > 0) {
            confirmAndUninstall(platforms, exit).catch(() => {});
        }
    }, [selected, exit]);

    const updateSelected = useCallback(() => {
        const platforms = [...selected];
        if (platforms.length === 0) {
            return;
        }
        // 批量更新与「全部更新」同一 kind，共用页顶横幅、single-flight 与汇总 toast
        const started = startPluginOp('updating', async () =>
            summarizeUpdate(await pluginManager.updateMany(platforms)),
        );
        if (!started) {
            showToast(t('pluginManager.opInProgress'), { type: 'info' });
            return;
        }
        exit();
    }, [selected, exit]);

    return {
        selecting,
        selected,
        allSelected,
        enter,
        exit,
        toggle,
        toggleAll,
        uninstallSelected,
        updateSelected,
    };
}

/** 批量卸载：确认 → 有其他插件操作在跑时让行 → 卸载 → 汇总 toast → 退出多选 */
async function confirmAndUninstall(
    platforms: string[],
    onDone: () => void,
): Promise<void> {
    const confirmed = await showConfirmDialog({
        title: t('pluginManager.selecting.confirmUninstall', {
            count: platforms.length,
        }),
        danger: true,
    });
    if (!confirmed) {
        return;
    }
    // 写事务已由 core 串行，这里仅作 UX 守卫：有安装 / 更新在跑时不并发触发破坏性操作
    if (atomStore.get(pluginOpAtom) !== null) {
        showToast(t('pluginManager.opInProgress'), { type: 'info' });
        return;
    }
    try {
        await pluginManager.uninstallMany(platforms);
    } catch {
        // 卸载失败时保留选择，便于用户重试
        showToast(t('feedback.unknownError'), { type: 'error' });
        return;
    }
    showToast(
        t('pluginManager.selecting.uninstalledMany', {
            count: platforms.length,
        }),
        { type: 'success' },
    );
    onDone();
}
