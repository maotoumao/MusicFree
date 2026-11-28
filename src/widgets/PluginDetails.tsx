import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { showToast } from '@/components/overlay';
import { PanelRow } from '@/components/ui/PanelRow';
import { Text } from '@/components/ui/Text';
import {
    pluginManager,
    pluginQueryKey,
    usePlugin,
    usePluginAlternative,
    usePlugins,
    usePluginUserVariables,
} from '@/core/plugin';
import { space } from '@/design';
import { useT } from '@/i18n';
import { shareText } from '@/infra/share';
import { showConfirmDialog } from '@/widgets/overlays/ConfirmDialog';
import {
    promptImportMedia,
    type ImportKind,
} from '@/widgets/overlays/importMedia';
import { showPluginAlternativePanel } from '@/widgets/overlays/PluginAlternativePanel';
import { showPluginDescriptionPanel } from '@/widgets/overlays/PluginDescriptionPanel';
import { showPluginVariablesPanel } from '@/widgets/overlays/PluginVariablesPanel';

import type { InstallFailure } from '@/core/plugin';
import type { TranslationKey } from '@/i18n';

/** 分组小标题：sm/medium/textSecondary，上方 space.xl 形成功能边界 */
function GroupTitle({ children }: { children: string }) {
    return (
        <Text
            size="sm"
            weight="medium"
            color="textSecondary"
            style={styles.groupTitle}
        >
            {children}
        </Text>
    );
}

interface PluginDetailsProps {
    /** 目标插件公开身份；实体与设置经 live hooks 取 */
    platform: string;
    /**
     * 宿主是否仍是可交互的那一个：导入流程先 load 再开面板，load 期间宿主若已被关 / 换掉，放弃开面板
     * Panel 宿主传 overlay status.active；横屏常驻右栏恒 true
     */
    active: boolean;
    /**
     * 实体消失（自己卸载或外部移除）时调用：Panel 关闭自己、常驻右栏换选中项
     * 带上是哪个 platform 没了：卸载的异步尾巴可能在本实例已被换掉后才落地，宿主据此只清自己那一项
     */
    onGone(platform: string): void;
}

const INSTALL_FAIL_KEY = {
    olderVersion: 'pluginManager.installResult.olderVersion',
    versionMismatch: 'pluginManager.installResult.versionMismatch',
    parseError: 'pluginManager.installResult.parseError',
    invalid: 'pluginManager.installResult.invalid',
    notPluginSource: 'pluginManager.installResult.notPluginSource',
} satisfies Record<
    Exclude<InstallFailure['reason'], 'network'>,
    TranslationKey
>;

/**
 * 插件详情正文：用法 / 导入 / 替代源 / 变量 / 检查更新 / 分享 / 卸载
 * core-aware 聚合块，只收 platform、内部 live 读 + 命令落盘；
 * 手机由 PluginDetailsPanel（底部面板）承载，平板横屏由插件管理页的右栏常驻承载
 */
export function PluginDetails({
    platform,
    active,
    onGone,
}: PluginDetailsProps) {
    const t = useT();
    const queryClient = useQueryClient();
    const plugin = usePlugin(platform);
    const currentValues = usePluginUserVariables(platform);
    const currentAlternative = usePluginAlternative(platform);
    const allPlugins = usePlugins();
    const importingRef = useRef(false);
    const activeRef = useRef(active);
    activeRef.current = active;
    // 卸载即失活：导入流程 load 期间宿主被换掉（横屏切插件 / 进排序 / 旋转），旧闭包不再开面板
    useEffect(
        () => () => {
            activeRef.current = false;
        },
        [],
    );

    // 实体消失（自己卸载或外部移除）→ 交给宿主处置，不渲染「插件不存在」帧
    useEffect(() => {
        if (!plugin) {
            onGone(platform);
        }
    }, [plugin, platform, onGone]);
    if (!plugin) {
        return null;
    }

    const canImportMusic = plugin.supportedMethods.has('importMusicItem');
    const canImportPlaylist = plugin.supportedMethods.has('importPlaylist');
    const alternativeCandidates = allPlugins
        .filter(
            it =>
                it.platform !== platform &&
                it.supportedMethods.has('getMediaSource'),
        )
        .map(it => it.platform);
    const hasVariables = (plugin.userVariables?.length ?? 0) > 0;
    const hasSource = Boolean(plugin.srcUrl);
    const hasDescription = Boolean(plugin.description?.trim());

    const subtitle = [plugin.version, plugin.author]
        .filter(Boolean)
        .join(' · ');

    // 预 load 后开导入面板：ref 防 load 期间重复触发；load 后宿主已不活跃则放弃开面板
    const startImport = (kind: ImportKind) => {
        if (importingRef.current) {
            return;
        }
        importingRef.current = true;
        const run = async () => {
            try {
                await plugin.load();
                if (activeRef.current) {
                    await promptImportMedia(plugin, kind);
                }
            } finally {
                importingRef.current = false;
            }
        };
        // load 失败等忽略；promptImportMedia 内部亦有兜底
        run().catch(() => {});
    };

    const editVariables = async () => {
        if (!plugin.userVariables) {
            return;
        }
        const values = await showPluginVariablesPanel({
            platform,
            variables: plugin.userVariables,
            currentValues,
        });
        if (values !== undefined) {
            pluginManager.setUserVariables(platform, values);
            // 变量变更 → 该来源旧缓存作废（含未来榜单/推荐等）
            // 非活跃查询直接删除，活跃查询清空并用新变量重取
            const queryKey = pluginQueryKey(platform);
            queryClient.removeQueries({ queryKey, type: 'inactive' });
            queryClient
                .resetQueries({ queryKey, type: 'active' })
                .catch(() => {});
        }
    };

    const setAlternative = async () => {
        const chosen = await showPluginAlternativePanel({
            platform,
            candidates: alternativeCandidates,
            currentAlternative,
        });
        if (chosen !== undefined) {
            pluginManager.setAlternative(platform, chosen);
        }
    };

    const checkUpdate = async () => {
        const result = await pluginManager.update(platform);
        if (result.ok) {
            // 更新目标已被卸载 → 静默，不提示「已是最新」
            if (result.skipped) {
                return;
            }
            showToast(
                t(
                    result.alreadyInstalled
                        ? 'pluginManager.installResult.alreadyLatest'
                        : 'pluginManager.installResult.updateSuccess',
                ),
                { type: 'success' },
            );
        } else {
            let message: string;
            if (result.reason === 'network') {
                switch (result.detail?.kind) {
                    case 'status':
                        message = t('feedback.networkErrorStatus', {
                            status: result.detail.status,
                        });
                        break;
                    case 'timeout':
                        message = t('feedback.networkErrorTimedOut');
                        break;
                    default:
                        message = t('feedback.networkError');
                }
            } else {
                message = t(INSTALL_FAIL_KEY[result.reason]);
            }
            showToast(message, { type: 'error' });
        }
    };

    const shareSource = async () => {
        if (!plugin.srcUrl) {
            return;
        }
        try {
            await shareText(plugin.srcUrl);
        } catch {
            showToast(t('feedback.operationFailed'), { type: 'error' });
        }
    };

    const uninstall = async () => {
        const confirmed = await showConfirmDialog({
            title: t('pluginDetailsPanel.uninstallConfirm.title'),
            message: t('pluginDetailsPanel.uninstallConfirm.message', {
                platform,
            }),
            confirmText: t('pluginDetailsPanel.actions.uninstall'),
            danger: true,
        });
        if (confirmed) {
            await pluginManager.uninstall(platform);
            onGone(platform);
            showToast(t('pluginManager.uninstalled', { platform }));
        }
    };

    return (
        <View style={styles.root}>
            <Text
                size="xl"
                weight="bold"
                lineHeight="tight"
                style={styles.title}
            >
                {plugin.platform}
            </Text>
            {subtitle ? (
                <Text size="sm" color="textSecondary" style={styles.subtitle}>
                    {subtitle}
                </Text>
            ) : null}
            {plugin.state === 'error' ? (
                <Text size="sm" color="danger" style={styles.subtitle}>
                    {t(
                        plugin.errorReason === 'versionMismatch'
                            ? 'pluginManager.installResult.versionMismatch'
                            : 'pluginManager.installResult.parseError',
                    )}
                </Text>
            ) : null}
            <ScrollView style={styles.body}>
                {hasDescription ? (
                    <View style={styles.usageRow}>
                        <PanelRow
                            icon="book-open"
                            label={t('pluginDetailsPanel.usage')}
                            onPress={() =>
                                showPluginDescriptionPanel({ platform })
                            }
                        />
                    </View>
                ) : null}

                {canImportMusic || canImportPlaylist ? (
                    <>
                        <GroupTitle>
                            {t('pluginDetailsPanel.group.features')}
                        </GroupTitle>
                        {canImportMusic ? (
                            <PanelRow
                                icon="import"
                                label={t('importMedia.music')}
                                onPress={() => startImport('music')}
                            />
                        ) : null}
                        {canImportPlaylist ? (
                            <PanelRow
                                icon="import"
                                label={t('importMedia.playlist')}
                                onPress={() => startImport('playlist')}
                            />
                        ) : null}
                    </>
                ) : null}

                <GroupTitle>{t('pluginDetailsPanel.group.config')}</GroupTitle>
                <PanelRow
                    icon="route"
                    label={t('pluginDetailsPanel.alternative.label')}
                    value={
                        currentAlternative ??
                        t('pluginDetailsPanel.alternative.none')
                    }
                    onPress={setAlternative}
                />
                {hasVariables ? (
                    <PanelRow
                        icon="variable"
                        label={t('pluginDetailsPanel.variables.label')}
                        onPress={editVariables}
                    />
                ) : null}

                <GroupTitle>{t('pluginDetailsPanel.group.actions')}</GroupTitle>
                {hasSource ? (
                    <PanelRow
                        icon="refresh-cw"
                        label={t('pluginDetailsPanel.actions.checkUpdate')}
                        onPress={checkUpdate}
                    />
                ) : null}
                {hasSource ? (
                    <PanelRow
                        icon="share-2"
                        label={t('pluginDetailsPanel.actions.shareSource')}
                        onPress={shareSource}
                    />
                ) : null}
                <PanelRow
                    icon="trash-2"
                    label={t('pluginDetailsPanel.actions.uninstall')}
                    onPress={uninstall}
                    danger
                />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flexGrow: 1,
        flexShrink: 1,
    },
    title: {
        paddingHorizontal: space.lg,
    },
    subtitle: {
        paddingHorizontal: space.lg,
        marginTop: space.xs,
    },
    body: {
        flexGrow: 1,
        flexShrink: 1,
    },
    groupTitle: {
        marginTop: space.xl,
        paddingHorizontal: space.lg,
        marginBottom: space.sm,
    },
    usageRow: {
        marginTop: space.lg,
    },
});
