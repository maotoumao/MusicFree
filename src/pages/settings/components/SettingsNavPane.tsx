import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { borderWidth, layout, radius, space, useColors } from '@/design';
import { useT } from '@/i18n';

import type { SettingsSection, SettingsSectionKey } from '../lib/sections';

interface SettingsNavPaneProps {
    sections: readonly SettingsSection[];
    activeKey: SettingsSectionKey;
    onSelect(key: SettingsSectionKey): void;
}

/**
 * 设置·平板横屏左栏：分区目录
 *
 * 竖屏是一列到底的八个分区；横屏把分区标题拉成常驻目录，右栏只放当前分区——
 * 与 iPad 设置一致。选中态同时用底色、文字色与读屏态表达，不只靠颜色。
 */
export function SettingsNavPane({
    sections,
    activeKey,
    onSelect,
}: SettingsNavPaneProps) {
    const colors = useColors();
    const t = useT();
    return (
        <View
            style={[
                styles.pane,
                {
                    backgroundColor: colors.surface,
                    borderRightColor: colors.border,
                },
            ]}
        >
            <ScrollView
                contentContainerStyle={styles.list}
                showsVerticalScrollIndicator={false}
                accessibilityRole="tablist"
            >
                {sections.map(section => {
                    const selected = section.key === activeKey;
                    return (
                        <Pressable
                            key={section.key}
                            onPress={() => onSelect(section.key)}
                            accessibilityRole="tab"
                            accessibilityState={{ selected }}
                            accessibilityLabel={t(section.titleKey)}
                            style={[
                                styles.row,
                                selected
                                    ? { backgroundColor: colors.primarySoft }
                                    : null,
                            ]}
                        >
                            {({ pressed }) => (
                                <>
                                    {/* 按压反馈独立叠一层：已选中的行按下去也要有反应 */}
                                    {pressed ? (
                                        <View
                                            pointerEvents="none"
                                            style={[
                                                styles.pressOverlay,
                                                {
                                                    backgroundColor:
                                                        colors.ripple,
                                                },
                                            ]}
                                        />
                                    ) : null}
                                    <Icon
                                        name={section.icon}
                                        size="sm"
                                        color={
                                            selected
                                                ? 'onPrimarySoft'
                                                : 'textSecondary'
                                        }
                                    />
                                    <Text
                                        size="md"
                                        weight={selected ? 'bold' : 'regular'}
                                        color={
                                            selected ? 'onPrimarySoft' : 'text'
                                        }
                                        numberOfLines={1}
                                    >
                                        {t(section.titleKey)}
                                    </Text>
                                </>
                            )}
                        </Pressable>
                    );
                })}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    pane: {
        width: layout.navPaneWidth,
        borderRightWidth: borderWidth.hairline,
    },
    list: {
        paddingHorizontal: layout.gutter.compact,
        paddingVertical: space.md,
        gap: space.xs,
    },
    pressOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: radius.md,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        minHeight: 48,
        paddingHorizontal: layout.gutter.compact,
        borderRadius: radius.md,
    },
});
