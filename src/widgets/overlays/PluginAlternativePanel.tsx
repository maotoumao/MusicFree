import { ScrollView, StyleSheet, View } from 'react-native';

import { definePanel } from '@/components/overlay';
import { PanelRow } from '@/components/ui/PanelRow';
import { Text } from '@/components/ui/Text';
import { space } from '@/design';
import { useT } from '@/i18n';

import type { OverlayProps } from '@/components/overlay';

export interface PluginAlternativeOptions {
    /** 正在设置替代源的目标插件；仅用于标题，结果不重复携带 */
    platform: string;
    /** 可选替代源；调用方须排除目标插件自身 */
    candidates: readonly string[];
    /** 当前偏好；可指向已卸载、暂不在 candidates 中的 platform */
    currentAlternative: string | null;
}

function PluginAlternativePanelView({
    payload,
    close,
}: OverlayProps<PluginAlternativeOptions, string | null>) {
    const t = useT();
    const staleAlternative =
        payload.currentAlternative != null &&
        !payload.candidates.includes(payload.currentAlternative)
            ? payload.currentAlternative
            : null;

    return (
        <View style={styles.root}>
            <Text
                size="xl"
                weight="bold"
                lineHeight="tight"
                style={styles.title}
            >
                {t('pluginAlternativePanel.title', {
                    platform: payload.platform,
                })}
            </Text>
            <ScrollView style={styles.body}>
                <PanelRow
                    label={t('pluginAlternativePanel.noAlternative')}
                    selected={payload.currentAlternative == null}
                    onPress={() => close(null)}
                />
                {staleAlternative ? (
                    <PanelRow
                        label={t('pluginAlternativePanel.notInstalled', {
                            platform: staleAlternative,
                        })}
                        selected
                        disabled
                        separatorBefore
                        onPress={() => undefined}
                    />
                ) : null}
                {payload.candidates.map((candidate, index) => (
                    <PanelRow
                        key={candidate}
                        label={candidate}
                        selected={payload.currentAlternative === candidate}
                        separatorBefore={
                            staleAlternative == null && index === 0
                        }
                        onPress={() => close(candidate)}
                    />
                ))}
            </ScrollView>
        </View>
    );
}

/** 替代源单选 Panel：undefined=取消、null=不使用、string=选中 platform */
export const showPluginAlternativePanel = definePanel(
    PluginAlternativePanelView,
);

const styles = StyleSheet.create({
    root: {
        flexGrow: 1,
        flexShrink: 1,
    },
    title: {
        paddingHorizontal: space.lg,
    },
    body: {
        flexGrow: 1,
        flexShrink: 1,
        marginTop: space.lg,
    },
});
