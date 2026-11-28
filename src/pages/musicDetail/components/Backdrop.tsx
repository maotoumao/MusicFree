import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Image } from '@/components/ui/Image';
import { coverBackdrop, useColors } from '@/design';
import { colord } from '@/utils/color';

// 封面高斯模糊半径：直接烘进图片（静态、随屏转场、双端一致）
const BACKDROP_BLUR = 32;
// 合成参数与主题派生共用一组（见 design 的 coverBackdrop）：那边要按同一组数
// 算出「这一页实际的底色」才能派生出在它上面够看的强调色
const VEIL_LOCATIONS = coverBackdrop.scrimLocations;

interface BackdropProps {
    /** 当前曲封面 uri，作模糊氛围底 */
    artwork?: string;
}

/** 沉浸式背景：封面铺满 → 重模糊 → 竖直 scrim */
export const Backdrop = memo(function BackdropBase({ artwork }: BackdropProps) {
    const colors = useColors();
    const veil = colors.coverVeil;
    // LinearGradient 的 colors 要求「至少两项」的元组，故显式解构成定长。
    // 标注成四元组不是多余：`locations` 是整条转发过去的，而 LinearGradient 两个 prop
    // 的类型都是 `readonly [T, T, ...T[]]`，任意 ≥2 的长度都过——往 token 里加第 5 档
    // 会让 colors 仍是 4 项而 locations 变 5 项，静默错位。有了这行标注，那时 tsc 直接红
    const [top, upper, middle, bottom]: readonly [
        number,
        number,
        number,
        number,
    ] = coverBackdrop.scrimAlphas;
    const veilColors = [
        colord(veil).alpha(top).toRgbString(),
        colord(veil).alpha(upper).toRgbString(),
        colord(veil).alpha(middle).toRgbString(),
        colord(veil).alpha(bottom).toRgbString(),
    ] as const;
    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {artwork ? (
                <Image
                    source={artwork}
                    style={styles.art}
                    contentFit="cover"
                    blurRadius={BACKDROP_BLUR}
                />
            ) : null}
            <LinearGradient
                colors={veilColors}
                locations={VEIL_LOCATIONS}
                style={StyleSheet.absoluteFill}
            />
        </View>
    );
});

const styles = StyleSheet.create({
    // 放大越出屏沿 + 半透，模糊边缘不露白、近黑底透出
    art: {
        ...StyleSheet.absoluteFill,
        opacity: coverBackdrop.artOpacity,
        transform: [{ scale: 1.15 }],
    },
});
