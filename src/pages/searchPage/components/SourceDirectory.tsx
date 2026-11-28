import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { borderWidth, layout, radius, space, useColors } from '@/design';
import { useT } from '@/i18n';

import { SEARCH_TYPES } from '../lib/searchTypes';

import type { Plugin } from '@/core/plugin';

interface SourceDirectoryProps {
    /** 支持当前类型的启用源（与 pills 同一份数据） */
    sources: readonly Plugin[];
    activePlatform: string | undefined;
    onSelect(platform: string): void;
}

/**
 * 搜索·平板横屏左栏：来源目录（方案 B，见 docs/design/search-tablet.md）
 *
 * 手机上来源靠 pills 横滑切换；横屏把它变成常驻左栏，比较不同来源不再进进出出。
 * 每行只消费来源名与其声明的可搜类型摘要；选中态同时用底色、文字色与读屏态表达。
 * 不做来源排名、跨源计数或结果预览。
 */
export function SourceDirectory({
    sources,
    activePlatform,
    onSelect,
}: SourceDirectoryProps) {
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
            <Text
                size="xs"
                weight="medium"
                color="textSecondary"
                style={styles.heading}
            >
                {t('search.sources')}
            </Text>
            <ScrollView
                contentContainerStyle={styles.list}
                showsVerticalScrollIndicator={false}
                accessibilityRole="tablist"
            >
                {sources.map(plugin => {
                    const selected = plugin.platform === activePlatform;
                    // 未声明 = 支持全部类型（对齐 useSearchablePlugins 的判定）
                    const types = SEARCH_TYPES.filter(
                        type =>
                            plugin.supportedSearchTypes === undefined ||
                            plugin.supportedSearchTypes.includes(type),
                    );
                    return (
                        <Pressable
                            key={plugin.platform}
                            onPress={() => onSelect(plugin.platform)}
                            accessibilityRole="tab"
                            accessibilityState={{ selected }}
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
                                    <Text
                                        size="md"
                                        weight={selected ? 'bold' : 'medium'}
                                        color={
                                            selected ? 'onPrimarySoft' : 'text'
                                        }
                                        numberOfLines={1}
                                    >
                                        {plugin.platform}
                                    </Text>
                                    <Text
                                        size="xs"
                                        color="textSecondary"
                                        numberOfLines={1}
                                    >
                                        {types
                                            .map(type =>
                                                t(`media.type.${type}`),
                                            )
                                            .join(' · ')}
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
        width: layout.sourceDirectoryWidth,
        borderRightWidth: borderWidth.hairline,
        paddingTop: space.md,
    },
    heading: {
        paddingHorizontal: layout.gutter.tablet,
        paddingBottom: space.sm,
    },
    list: {
        paddingHorizontal: layout.gutter.compact,
        paddingBottom: space.lg,
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
        minHeight: 52,
        justifyContent: 'center',
        gap: 2,
        paddingHorizontal: layout.gutter.compact,
        borderRadius: radius.md,
    },
});
