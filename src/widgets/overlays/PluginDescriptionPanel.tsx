import { useEffect } from 'react';
import {
    Linking,
    ScrollView,
    StyleSheet,
    View,
    useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { definePanel, showToast } from '@/components/overlay';
import { IconButton, iconButtonEdgeInset } from '@/components/ui/IconButton';
import { Markdown } from '@/components/ui/Markdown';
import { Text } from '@/components/ui/Text';
import { usePlugin } from '@/core/plugin';
import { layout, space } from '@/design';
import { useOrientation } from '@/hooks/useOrientation';
import { useT } from '@/i18n';
import { showConfirmDialog } from '@/widgets/overlays/ConfirmDialog';

import type { OverlayProps } from '@/components/overlay';

export interface PluginDescriptionOptions {
    /** 目标插件公开身份；description 在 Panel 内经 live hook 取 */
    platform: string;
}

// 竖屏阅读面：内容自适应，至少 MIN、封顶 MAX 可用高（长文正文内部滚动）
const MIN_HEIGHT_RATIO = 0.4;
const MAX_HEIGHT_RATIO = 0.7;

function PluginDescriptionPanelView({
    payload,
    close,
}: OverlayProps<PluginDescriptionOptions, void>) {
    const { platform } = payload;
    const t = useT();
    const plugin = usePlugin(platform);
    const orientation = useOrientation();
    const { height: windowHeight } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const description = plugin?.description ?? '';
    const isEmpty = description.trim() === '';

    // 插件消失或说明变空 → 关闭（入口本就只在有说明时出现，不渲染空态）
    useEffect(() => {
        if (isEmpty) {
            close();
        }
    }, [isEmpty, close]);
    if (isEmpty) {
        return null;
    }

    const landscape = orientation === 'landscape';
    const available = windowHeight - insets.top;
    // 打开外链前弹出确认框并显示完整 URL，便于识别钓鱼或诱导链接
    const openLink = async (href: string) => {
        const confirmed = await showConfirmDialog({
            title: t('pluginDescriptionPanel.openLinkConfirm.title'),
            message: t('pluginDescriptionPanel.openLinkConfirm.message', {
                url: href,
            }),
            confirmText: t('common.open'),
        });
        if (!confirmed) {
            return;
        }
        Linking.openURL(href).catch(() => {
            showToast(t('pluginDescriptionPanel.linkFailed'), {
                type: 'error',
            });
        });
    };

    return (
        <View
            style={
                landscape
                    ? styles.rootFill
                    : { minHeight: available * MIN_HEIGHT_RATIO }
            }
        >
            <View style={styles.header}>
                <Text
                    size="lg"
                    weight="bold"
                    numberOfLines={1}
                    accessibilityRole="header"
                    style={styles.title}
                >
                    {t('pluginDescriptionPanel.title', { platform })}
                </Text>
                <IconButton
                    icon="x"
                    tone="textSecondary"
                    onPress={() => close()}
                    accessibilityLabel={t('pluginDescriptionPanel.a11y.close')}
                />
            </View>
            <ScrollView
                style={
                    landscape
                        ? styles.rootFill
                        : { maxHeight: available * MAX_HEIGHT_RATIO }
                }
                contentContainerStyle={styles.body}
            >
                <Markdown source={description} onOpenLink={openLink} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    rootFill: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: layout.screenGutter,
        /** 右端是贴边关闭按钮，外推后图标本体落回内容线 */
        paddingRight: iconButtonEdgeInset(layout.screenGutter),
        marginBottom: space.sm,
    },
    title: {
        flex: 1,
        marginRight: space.sm,
    },
    body: {
        paddingHorizontal: space.lg,
        paddingBottom: space.md,
    },
});

/** 插件说明阅读 Panel：只收 platform，内部 live 读 description 交受限 Markdown 渲染 */
export const showPluginDescriptionPanel = definePanel(
    PluginDescriptionPanelView,
);
