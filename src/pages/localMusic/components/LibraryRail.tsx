/**
 * 库视图左栏（横屏分栏专用）：全部 / 文件夹 / 专辑 / 艺术家
 *
 * 竖屏这四项是顶部的 Tab 条。横屏搬到左栏，是因为横屏缺的是**高度**：412dp 高的窗口里
 * 顶栏 + Tab 条 44 + 播放条已经吃掉 144（矮窗档 48 + 44 + 52；非矮窗是 56 + 44 + 64 = 164，
 * 见 layout/appBarLayout.appBarHeightFor），Tab 条这 44 搬到横向就还给了列表；
 * 而「选哪种切法」与「选哪个集合」本是同类的选择，该待在同一个方向上
 *
 * 两档：icon（图标 + 两字，手机横屏）/ labelled（图标 + 标签，平板横屏，复用 navPaneWidth）
 */
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import {
    borderWidth,
    iconSize,
    layout,
    radius,
    space,
    useColors,
} from '@/design';

import { libraryRailWidthFor, type LibraryRailForm } from '../lib/layout';

import type { IconName } from '@/components/ui/icons.generated';
import type { LocalMusicView } from '@/core/localMusic';

export interface LibraryRailItem {
    key: LocalMusicView;
    label: string;
    icon: IconName;
}

export function LibraryRail({
    items,
    value,
    onChange,
    form,
}: {
    items: readonly LibraryRailItem[];
    value: LocalMusicView;
    onChange: (next: LocalMusicView) => void;
    form: LibraryRailForm;
}) {
    const colors = useColors();
    const labelled = form === 'labelled';
    /*
     * 可纵向滚动：四项在图标档要约 204dp 高，而短横屏（如 915 × 300，主体可用高约 180）
     * 同样会进分栏——不给滚动，最下面的分类就点不到
     */
    return (
        <ScrollView
            style={[
                styles.rail,
                {
                    width: libraryRailWidthFor(form),
                    borderColor: colors.border,
                },
            ]}
            contentContainerStyle={[
                styles.railContent,
                labelled ? styles.railLabelled : styles.railIcon,
            ]}
            accessibilityRole="tablist"
        >
            {items.map(item => {
                const active = item.key === value;
                return (
                    <Pressable
                        key={item.key}
                        onPress={() => onChange(item.key)}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={item.label}
                        style={[
                            styles.item,
                            labelled ? styles.itemLabelled : styles.itemIcon,
                            active
                                ? { backgroundColor: colors.primarySoft }
                                : null,
                        ]}
                    >
                        <Icon
                            name={item.icon}
                            size={iconSize.md}
                            color={active ? 'primary' : 'textSecondary'}
                        />
                        <Text
                            size={labelled ? 'md' : 'xs'}
                            weight={active ? 'medium' : 'regular'}
                            color={active ? 'primary' : 'textSecondary'}
                            numberOfLines={1}
                        >
                            {item.label}
                        </Text>
                    </Pressable>
                );
            })}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    // 栏宽由 width 定，不参与行内伸缩（ScrollView 的 baseVertical 自带 flexShrink:1，要盖掉）
    rail: {
        borderRightWidth: borderWidth.hairline,
        flexGrow: 0,
        flexShrink: 0,
    },
    railContent: {
        gap: space.xs,
    },
    railIcon: {
        paddingVertical: space.sm,
        paddingHorizontal: space.xs,
    },
    railLabelled: {
        paddingVertical: space.sm,
        paddingHorizontal: space.sm,
    },
    item: {
        borderRadius: radius.md,
        justifyContent: 'center',
    },
    // 图标档：图标在上、两字在下，整格仍不低于命中目标
    itemIcon: {
        alignItems: 'center',
        gap: space.xs,
        minHeight: layout.hitTarget,
        paddingVertical: space.sm,
    },
    itemLabelled: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        minHeight: layout.hitTarget,
        paddingHorizontal: space.md,
    },
});
