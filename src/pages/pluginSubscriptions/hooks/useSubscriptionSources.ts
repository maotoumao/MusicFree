/**
 * 订阅源管理编排 hook：本地维护列表（此页是唯一编辑者），改动写回 config
 * 新增 / 编辑走 PluginSubscriptionPanel（地址格式与重复校验在提交回调里），行菜单提供复制与删除
 */
import { useCallback, useState } from 'react';

import { showToast } from '@/components/overlay';
import { pluginManager } from '@/core/plugin';
import { t } from '@/i18n';
import { copyText } from '@/infra/clipboard';
import { normalizeHttpUrl } from '@/utils/url';
import { showActionSheetPanel } from '@/widgets/overlays/ActionSheetPanel';
import { showConfirmDialog } from '@/widgets/overlays/ConfirmDialog';
import { showPluginSubscriptionPanel } from '@/widgets/overlays/PluginSubscriptionPanel';

import type { SubscribeSource } from '@/core/plugin';

export function useSubscriptionSources(): {
    sources: SubscribeSource[];
    promptAdd: () => void;
    openRowMenu: (index: number) => void;
} {
    const [sources, setSources] = useState<SubscribeSource[]>(() =>
        pluginManager.getSubscriptions(),
    );

    // 先写 config（权威）再更新本地 state：写入失败则列表不动，UI 与持久化不分叉
    const saveSources = useCallback((next: SubscribeSource[]) => {
        pluginManager.setSubscriptions(next);
        setSources(next);
    }, []);

    // 新增（editIndex 空）/ 编辑（预填现有项）共用面板；提交时校验地址格式与重复
    const openEditor = useCallback(
        (editIndex?: number) => {
            const editing =
                editIndex !== undefined ? sources[editIndex] : undefined;
            showPluginSubscriptionPanel({
                source: editing,
                onSubmit: async draft => {
                    // 落库的是规范化后的地址：同步时拿它去请求，粘贴噪音不能跟着进配置
                    const url = normalizeHttpUrl(draft.url);
                    if (!url) {
                        showToast(t('pluginSubscriptionPanel.invalidUrl'), {
                            type: 'error',
                        });
                        return { ok: false };
                    }
                    const normalized = { ...draft, url };
                    // 地址唯一：与其他订阅源撞则拒（编辑时排除自身）
                    const duplicate = sources.some(
                        (s, i) =>
                            i !== editIndex &&
                            (normalizeHttpUrl(s.url) ?? s.url) === url,
                    );
                    if (duplicate) {
                        showToast(t('pluginSubscriptionPanel.duplicateUrl'), {
                            type: 'error',
                        });
                        return { ok: false };
                    }
                    saveSources(
                        editIndex !== undefined
                            ? sources.map((s, i) =>
                                  i === editIndex ? normalized : s,
                              )
                            : [...sources, normalized],
                    );
                    return { ok: true };
                },
            });
        },
        [sources, saveSources],
    );

    const promptAdd = useCallback(() => openEditor(), [openEditor]);

    // 删除：danger 确认后按快照剔除该项（模态期间列表不变，index 稳定）
    const confirmDelete = useCallback(
        async (index: number) => {
            const target = sources[index];
            if (!target) {
                return;
            }
            const dialog = showConfirmDialog({
                title: t('pluginSubscriptions.deleteConfirm', {
                    name: target.name,
                }),
                danger: true,
            });
            if (!(await dialog)) {
                return;
            }
            saveSources(sources.filter((_, i) => i !== index));
        },
        [sources, saveSources],
    );

    // 行菜单：编辑 / 复制订阅链接 / 删除
    const openRowMenu = useCallback(
        (index: number) => {
            const target = sources[index];
            if (!target) {
                return;
            }
            showActionSheetPanel({
                title: target.name,
                items: [
                    {
                        icon: 'pencil',
                        label: t('common.edit'),
                        onPress: () => openEditor(index),
                    },
                    {
                        icon: 'copy',
                        label: t('pluginSubscriptions.copyLink'),
                        onPress: () => {
                            copyText(target.url)
                                .then(() => {
                                    showToast(t('feedback.copied'), {
                                        type: 'success',
                                    });
                                })
                                .catch(() => {
                                    showToast(t('feedback.operationFailed'), {
                                        type: 'error',
                                    });
                                });
                        },
                    },
                    {
                        icon: 'trash-2',
                        label: t('common.delete'),
                        danger: true,
                        onPress: () => {
                            confirmDelete(index).catch(() => {});
                        },
                    },
                ],
            });
        },
        [sources, openEditor, confirmDelete],
    );

    return { sources, promptAdd, openRowMenu };
}
