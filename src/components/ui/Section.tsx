import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { layout, space } from '@/design';

import { Text } from './Text';

import type { Colors, fontSize, fontWeight } from '@/design';

/** 区块标题的一档刻度：排版三件套 + 横向留白 + 上下节奏 */
interface HeadingStyle {
    size: keyof typeof fontSize;
    weight: keyof typeof fontWeight;
    /** 语义色 key，由组件解析成实际色值 */
    color: keyof Colors;
    /** 标题行横向留白；内容的横向留白由子节点自理 */
    gutter: number;
    /** 标题行最小高度：右侧动作要够命中区 */
    minHeight: number;
    /** 直接子节点之间的距离：标题→内容、以及内容各项之间 */
    gap: number;
    /** 标题下方额外追加的距离（叠加在 gap 之上），让标题与它的内容比内容各项之间更疏 */
    gapAfterHeading: number;
}

/**
 * 标题两档，按标题扮演的角色分（不按用在哪）
 * title：这块内容叫什么名字，本身是屏幕上的一级内容，可配右侧动作
 * label：给下面一组同类项贴的归类标签，离开它们就不成立
 */
const headingStyles = {
    title: {
        size: 'lg',
        weight: 'bold',
        color: 'text',
        gutter: layout.screenGutter,
        minHeight: layout.hitTarget,
        gap: 0,
        gapAfterHeading: 0,
    },
    label: {
        size: 'sm',
        weight: 'medium',
        color: 'textSecondary',
        // 横向留白由所在的面板容器给
        gutter: 0,
        minHeight: 0,
        // 组内行贴紧：相邻两行本就各有命中区高度，再留间距就散了
        gap: space.xs,
        gapAfterHeading: space.xs,
    },
} as const satisfies Record<string, HeadingStyle>;

interface SectionProps {
    title: string;
    /**
     * 标题档位：title=这块内容的名字（一级内容，可配右侧动作）；
     * label=给下面一组同类项贴的归类标签
     */
    heading?: keyof typeof headingStyles;
    /** 标题行右侧动作（如「查看全部」）；不给则标题独占左侧 */
    trailing?: ReactNode;
    children: ReactNode;
}

/**
 * 带标题的区块：标题行（+右侧动作）+ 内容；区块之间的间距由外层列表 gap 统一
 * 排版 / 留白 / 组内节奏全部取自 headingStyles，组件内不留分支
 */
export function Section({
    title,
    heading = 'title',
    trailing,
    children,
}: SectionProps) {
    const headingStyle = headingStyles[heading];
    return (
        <View style={{ gap: headingStyle.gap }}>
            <View
                style={[
                    styles.head,
                    {
                        paddingHorizontal: headingStyle.gutter,
                        minHeight: headingStyle.minHeight,
                        marginBottom: headingStyle.gapAfterHeading,
                    },
                ]}
            >
                <Text
                    size={headingStyle.size}
                    weight={headingStyle.weight}
                    color={headingStyle.color}
                    accessibilityRole="header"
                >
                    {title}
                </Text>
                {trailing}
            </View>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    head: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
});
