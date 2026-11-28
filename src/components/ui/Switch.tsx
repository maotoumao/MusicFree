import { useEffect } from 'react';
import {
    Pressable,
    StyleSheet,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import Animated, {
    interpolate,
    interpolateColor,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';

import {
    borderWidth,
    duration,
    easing,
    elevation,
    opacity,
    radius,
    useColors,
} from '@/design';
import { colord } from '@/utils/color';

// 轨道 48×28、thumb 22
const TRACK_W = 48; // 48
const TRACK_H = 26; // 轨道高（不在 space 阶梯上）
const THUMB = 20; // thumb 直径（专属常数，轨道内四向留 3 均等余量）
const INSET = 3; // thumb 目标外沿留白（四向一致）
// track 的 1dp 边框在内侧，flex 子节点起点已内缩 1dp；平移端点扣掉边框使实测外沿留白 = INSET
const THUMB_OFF_X = INSET - borderWidth.hairline; // 2：关态 thumb 平移起点
const THUMB_ON_X = TRACK_W - THUMB - INSET - borderWidth.hairline; // 20：开态 thumb 平移终点

interface SwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    /**
     * 紧凑档：外壳收到轨道尺寸，不再自带 44 命中区
     * 仅当外层已提供足够命中区时用（如整行可点的设置行）——否则开关会小到点不准
     */
    dense?: boolean;
    /** 必填：读屏播报，通常取所在行的名称 */
    accessibilityLabel: string;
    style?: StyleProp<ViewStyle>;
}

/** 开关：thumb 滑动 + 轨道变色（150ms）；状态只靠 toggle 动效表达，不叠按压 opacity */
export function Switch({
    checked,
    onChange,
    disabled = false,
    dense = false,
    accessibilityLabel,
    style,
}: SwitchProps) {
    const colors = useColors();
    // progress 1=开 0=关；同步驱 thumb 平移 + 轨道底色
    const progress = useSharedValue(checked ? 1 : 0);
    useEffect(() => {
        progress.value = withTiming(checked ? 1 : 0, {
            duration: duration.fast,
            easing: easing.standard,
        });
    }, [checked, progress]);
    // 开态轨道：禁用走中性灰 textDisabled（避免饱和色乘透明度发脏），否则 primary
    const onTrackColor = disabled ? colors.textDisabled : colors.primary;
    // 开态描边：启用态开轨道无描边（primary 底不需要），禁用态保留描边兜底可辨识
    const openBorderColor = disabled ? colors.border : 'transparent';
    const trackStyle = useAnimatedStyle(() => ({
        backgroundColor: interpolateColor(
            progress.value,
            [0, 1],
            [colors.surfaceVariant, onTrackColor],
        ),
        borderColor: interpolateColor(
            progress.value,
            [0, 1],
            [colors.border, openBorderColor],
        ),
    }));
    const thumbStyle = useAnimatedStyle(() => ({
        transform: [
            {
                translateX: interpolate(
                    progress.value,
                    [0, 1],
                    [THUMB_OFF_X, THUMB_ON_X],
                ),
            },
        ],
    }));
    // thumb 投影走 boxShadow 而非 elevation：Android 的 elevation 在 24dp 小圆上会糊成灰边、
    // 轮廓也不跟随 Reanimated 的 translateX；boxShadow 由 Fabric 直接绘制，跨端一致
    const thumbShadow = {
        boxShadow: [
            {
                offsetX: 0,
                offsetY: elevation.sm.shadowOffset.height,
                blurRadius: elevation.sm.shadowRadius,
                color: colord(colors.shadow)
                    .alpha(elevation.sm.shadowOpacity)
                    .toRgbString(),
            },
        ],
    };
    return (
        <Pressable
            onPress={disabled ? undefined : () => onChange(!checked)}
            disabled={disabled}
            accessibilityRole="switch"
            accessibilityState={{ checked, disabled }}
            accessibilityLabel={accessibilityLabel}
            style={[
                styles.shell,
                dense ? styles.shellDense : null,
                disabled ? styles.disabled : null,
                style,
            ]}
        >
            <Animated.View style={[styles.track, trackStyle]}>
                {/* thumb 恒定浅色（knob）：两态轨道底色差异大，恒色才不会在某一态糊掉 */}
                <Animated.View
                    style={[
                        styles.thumb,
                        { backgroundColor: colors.knob },
                        thumbShadow,
                        thumbStyle,
                    ]}
                />
            </Animated.View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    shell: {
        width: TRACK_W,
        height: TRACK_W,
        alignItems: 'center',
        justifyContent: 'center',
    },
    /** 紧凑档：壳即轨道，不占额外高度（命中区由外层保证） */
    shellDense: {
        height: TRACK_H,
    },
    disabled: {
        opacity: opacity.disabled,
    },
    track: {
        width: TRACK_W,
        height: TRACK_H,
        borderRadius: radius.full,
        borderWidth: borderWidth.hairline,
        justifyContent: 'center',
    },
    thumb: {
        width: THUMB,
        height: THUMB,
        borderRadius: radius.full,
    },
});
