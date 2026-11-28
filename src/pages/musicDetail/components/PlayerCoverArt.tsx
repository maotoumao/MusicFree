import { StyleSheet, View } from 'react-native';

import { MediaCover } from '@/components/ui/MediaCover';
import { radius, useColors } from '@/design';

/**
 * 播放页的大封面方块：浮起阴影 + 圆角
 * 封面模式与横屏并排共用同一块，免得两处各写一份阴影、日后视觉漂移
 * 尺寸由调用方按可用空间算好传入（本组件不测量）
 */
export function PlayerCoverArt({
    artwork,
    size,
}: {
    artwork?: string;
    size: number;
}) {
    const colors = useColors();
    // 写成「非正数才画」而非 size <= 0：两者在 NaN 上不同（NaN 两个比较都 false），
    // 而 CoverStage 原来的 `size > 0 ? … : null` 对 NaN 是不画。宽高吃到 NaN 会一路传进 expo-image
    if (!(size > 0)) {
        return null;
    }
    return (
        <View
            style={[
                styles.art,
                {
                    width: size,
                    height: size,
                    backgroundColor: colors.surfaceVariant,
                    shadowColor: colors.shadow,
                },
            ]}
        >
            <MediaCover
                source={artwork}
                fallbackIcon="disc-3"
                size={size}
                radius={radius['2xl']}
                transition={0}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    // 大封面浮起阴影（几何字面量，无对应 token）；宽高运行时按可用空间定
    art: {
        borderRadius: radius['2xl'],
        elevation: 12,
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.4,
        shadowRadius: 26,
    },
});
