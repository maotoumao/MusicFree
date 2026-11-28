import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import {
    borderWidth,
    layout,
    opacity,
    radius,
    space,
    useColors,
} from '@/design';
import { useCompactHeight } from '@/hooks/useCompactHeight';

import {
    entryGridColumnsFor,
    entryGridKeyFor,
    entryGridWidthFor,
    type EntryGridMeasurement,
} from '../lib/entryGrid';

import type { IconName } from '@/components/ui/icons.generated';

/** 一张入口卡：稳定 key + 已翻译文案 + 图标 + 导航动作 */
export interface EntryCardItem {
    key: string;
    label: string;
    icon: IconName;
    a11yLabel: string;
    onPress: () => void;
}

/** 卡高（dp）：≥ 44 触达；图标底 40 上下各留 8 */
const CARD_HEIGHT = 56;
/** 图标底边长（dp）：与列表行 44 缩略图同一视觉列，比它略小以示「入口」而非「内容」 */
const ICON_WELL = 40;
/** 卡间距（dp） */
const GAP = space.md;

/** 网格容器的共有排布；限宽与否各自 spread 出一份静态样式 */
const GRID_BASE = {
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
    paddingHorizontal: layout.screenGutter,
} as const;
interface EntryCardsProps {
    items: readonly EntryCardItem[];
    /** 独占一行的通栏卡（如「最近播放」），放在网格上方、与网格同一内容列 */
    featured?: ReactNode;
}

/**
 * 首页入口卡网格：可选的通栏卡在上 + 定列数、等宽、hairline 描边的类型卡在下
 *
 * 容器在宽屏下限宽 listContentMaxWidth 并居中，与首页列表行同一条内容列；
 * 矮窗（手机横屏）不限宽——那里高度才短缺，铺满 780dp 后四张卡由 2 × 2 收成一行，
 * 省下的一整行（卡高 + 间距）比限宽买到的留白值钱；首页列表行同步取消限宽，两者仍对齐。
 * 列数与卡宽都按容器实测宽算，不按窗口宽——
 * 横屏安全区与限宽都会让容器比窗口窄，按窗口算会把末卡挤到下一行。
 * 实测到达前先用「窗口宽 − 横向安全区、封顶限宽」估一帧：它与实测只差取整，
 * 首帧就能渲出正确高度，作为 FlashList header 不会从 0 跳到 56。
 * 实测值带档标识、切档即作废（见 lib/entryGrid 的 entryGridWidthFor）——
 * 仓里另外两处按实测算几何的网格（ThemePackGrid 的 cardWidth、ArtistWorksScaffold 的
 * worksPaneWidth）都还是不会失效的粘性实测，旋转那一帧会用旧宽渲一次；
 * 它们不在本次范围内，别照着它们抄。
 * 定宽而非 flex 撑满：末行孤卡保持与同伴等宽，半行是网格的诚实状态。
 */
export function EntryCards({ items, featured }: EntryCardsProps) {
    const colors = useColors();
    const { width: windowWidth } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const isCompact = useCompactHeight();
    const [measured, setMeasured] = useState<EntryGridMeasurement | null>(null);
    // 估值与实测都必须与容器当前的限宽档一致，否则会渲出上一档的列数（见 entryGridWidthFor）
    const availableWidth = windowWidth - insets.left - insets.right;
    const layoutKey = entryGridKeyFor(availableWidth, isCompact);
    const gridWidth = entryGridWidthFor(availableWidth, isCompact, measured);
    // onLayout 量的是含 gutter 的外框；entryGridColumnsFor 内部会扣掉两侧 gutter，
    // 并按张数收成不出末行孤卡的列数（四张卡在 640 列里算出 3 列 → 2 × 2）
    const columns = entryGridColumnsFor(gridWidth, items.length);
    const contentWidth = gridWidth - layout.screenGutter * 2;
    // floor：亚像素余量会让末卡换行
    const cardWidth = Math.floor(
        (contentWidth - GAP * (columns - 1)) / columns,
    );
    return (
        <View
            style={isCompact ? styles.gridCompact : styles.grid}
            onLayout={event => {
                const width = event.nativeEvent.layout.width;
                // 同值同档时返回原对象：保住 useState 的 bail-out，免得每次 layout 都多渲一帧
                setMeasured(prev =>
                    prev?.width === width && prev.layoutKey === layoutKey
                        ? prev
                        : { width, layoutKey },
                );
            }}
        >
            {featured}
            {items.map(item => (
                <Pressable
                    key={item.key}
                    onPress={item.onPress}
                    accessibilityRole="button"
                    accessibilityLabel={item.a11yLabel}
                    style={({ pressed }) => [
                        styles.card,
                        {
                            width: cardWidth,
                            backgroundColor: colors.surface,
                            borderColor: colors.border,
                            opacity: pressed ? opacity.pressed : 1,
                        },
                    ]}
                >
                    <View
                        style={[
                            styles.iconWell,
                            { backgroundColor: colors.primarySoft },
                        ]}
                    >
                        <Icon
                            name={item.icon}
                            size="md"
                            color="onPrimarySoft"
                        />
                    </View>
                    <Text
                        size="md"
                        weight="medium"
                        numberOfLines={1}
                        style={styles.label}
                    >
                        {item.label}
                    </Text>
                </Pressable>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    grid: { ...GRID_BASE, maxWidth: layout.listContentMaxWidth },
    /** 矮窗档：不限宽，让 gridColumnsFor 自然加列 */
    gridCompact: GRID_BASE,
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        height: CARD_HEIGHT,
        paddingHorizontal: space.sm,
        borderRadius: radius.md,
        borderWidth: borderWidth.hairline,
    },
    iconWell: {
        width: ICON_WELL,
        height: ICON_WELL,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    label: {
        flex: 1,
    },
});
