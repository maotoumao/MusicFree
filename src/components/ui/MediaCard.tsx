import { Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePressAnimation } from '@/components/hooks/usePressAnimation';
import { radius, space } from '@/design';

import { MediaCover } from './MediaCover';
import { Text } from './Text';

import type { IconName } from './icons.generated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** 封面格尺寸（组件专属几何，无对应 token） */
const COVER = 80;

interface MediaCardProps {
    /** 封面 uri；空 / 失败时以 fallbackIcon 兜底 */
    source?: string;
    /** 缺封面兜底图标（专辑 disc-3、歌单 list-music…） */
    fallbackIcon: IconName;
    title: string;
    subtitle?: string;
    onPress: () => void;
    /** 撑满父容器宽度（网格列用；封面转为随列宽的正方形）；默认 false = 固定宽度的横滚单元 */
    fill?: boolean;
    accessibilityLabel?: string;
}

/**
 * 竖排封面卡：方形封面 + 标题（+副标题）
 * 默认固定宽度（横滚轮播单元）；fill=true 撑满父容器宽度（两列网格）
 * 纯 UI，播放 / 导航由调用方经 onPress 注入
 */
export function MediaCard({
    source,
    fallbackIcon,
    title,
    subtitle,
    onPress,
    fill,
    accessibilityLabel,
}: MediaCardProps) {
    const { animatedStyle, onPressIn, onPressOut } = usePressAnimation(0.96);
    return (
        <AnimatedPressable
            onPress={onPress}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? title}
            style={[fill ? styles.cellFill : styles.cell, animatedStyle]}
        >
            <MediaCover
                source={source}
                fallbackIcon={fallbackIcon}
                size={fill ? undefined : COVER}
                radius={radius.lg}
            />
            <Text
                size={fill ? 'md' : 'sm'}
                weight="medium"
                numberOfLines={2}
                style={fill ? styles.titleFill : undefined}
            >
                {title}
            </Text>
            {subtitle ? (
                <Text
                    size={fill ? 'sm' : 'xs'}
                    color="textSecondary"
                    numberOfLines={1}
                >
                    {subtitle}
                </Text>
            ) : null}
        </AnimatedPressable>
    );
}

const styles = StyleSheet.create({
    cell: {
        width: COVER,
        gap: space.sm,
    },
    cellFill: {
        width: '100%',
        gap: space.sm,
    },
    // fill 网格等高：标题固定两行（几何专属，无对应 token）；副标题有则占一行、无则不占（同网格统一）
    titleFill: {
        minHeight: 40,
    },
});
