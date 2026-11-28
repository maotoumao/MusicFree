import { memo, type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { useSlider } from '@/components/hooks/useSlider';
import { layout, radius as radiusTokens, useColors } from '@/design';

/** 视觉常量（无对应 token） */
const TRACK_HEIGHT = 4;
const THUMB_SIZE = 16;

export interface SliderProps {
    /** 当前值（受控）；拖动时组件内部接管，忽略外部 value 直到松手 */
    value: number;
    /** 上限 */
    max: number;
    /** 下限，默认 0 */
    min?: number;
    /** 吸附步长（值单位）；不传=连续 */
    step?: number;

    /** 拖动实时值 */
    onChange?: (value: number) => void;
    /** 开始交互 */
    onChangeStart?: () => void;
    /**
     * 松手或点按后提交最终值
     * 受控约定：消费方应在此乐观更新 value，避免生效前滑块回跳
     */
    onChangeEnd?: (value: number) => void;
    /** 拖动被取消（父手势抢占等）：未提交，消费方应清预览态 */
    onChangeCancel?: () => void;
    /** 禁用交互，纯展示 */
    disabled?: boolean;

    /** 轨道高度，默认 4 */
    trackHeight?: number;
    /** 圆角，默认 radius.full */
    radius?: number;
    /** 轨道底色，默认 surfaceVariant */
    trackColor?: string;
    /** 已选填充色，默认 primary */
    fillColor?: string;
    /** 拇指显隐：常显 / 仅触摸 / 从不，默认 always */
    thumb?: 'always' | 'active' | 'never';
    /** 拇指色，默认 fillColor（renderThumb 时忽略） */
    thumbColor?: string;
    /** 拇指直径，默认 16 */
    thumbSize?: number;
    /** 拖动时拇指直径，默认 thumbSize + 4 */
    activeThumbSize?: number;
    /** 自定义拇指；size 随拖动放大，value 为受控值 */
    renderThumb?: (state: {
        dragging: boolean;
        size: number;
        value: number;
    }) => ReactNode;

    /** 命中区高度（视觉细但可点），默认 hitTarget 44 */
    hitHeight?: number;
    /** 无障碍增减步长，默认 step ?? (max−min)/20 */
    accessibilityStep?: number;
    accessibilityLabel?: string;
    /** 无障碍朗读文案（如 "14" / "70%"）；不传则朗读百分比 */
    accessibilityValueText?: string;
    style?: ViewStyle;
}

/**
 * 通用可拖动滑杆：支持受控值、拖动接管、点按定位、step 吸附、命中区 ≥44dp 和无障碍调节
 * 纯 UI，颜色默认取自 token；进度条专属能力（缓冲段）见 SeekBar
 */
export const Slider = memo(function SliderBase({
    value,
    max,
    min = 0,
    step,
    onChange,
    onChangeStart,
    onChangeEnd,
    onChangeCancel,
    disabled = false,
    trackHeight = TRACK_HEIGHT,
    radius: radiusProp,
    trackColor,
    fillColor,
    thumb = 'always',
    thumbColor,
    thumbSize = THUMB_SIZE,
    activeThumbSize,
    renderThumb,
    hitHeight = layout.hitTarget,
    accessibilityStep,
    accessibilityLabel,
    accessibilityValueText,
    style,
}: SliderProps) {
    const colors = useColors();
    const rad = radiusProp ?? radiusTokens.full;
    const trackBg = trackColor ?? colors.surfaceVariant;
    const fill = fillColor ?? colors.primary;
    const thumbBg = thumbColor ?? fill;
    const activeSize = activeThumbSize ?? thumbSize + 4;

    const {
        gesture,
        onLayout,
        accessibility,
        dragging,
        value: current,
        posFrac,
        dragProg,
        trackWidth,
    } = useSlider({
        value,
        max,
        min,
        step,
        onChange,
        onChangeStart,
        onChangeEnd,
        onChangeCancel,
        disabled,
        accessibilityStep,
        accessibilityLabel,
        accessibilityValueText,
    });

    const fillStyle = useAnimatedStyle(() => ({
        width: posFrac.value * trackWidth.value,
    }));
    const thumbWrapStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: posFrac.value * trackWidth.value }],
        opacity:
            thumb === 'never' ? 0 : thumb === 'active' ? dragProg.value : 1,
    }));
    const dotStyle = useAnimatedStyle(() => {
        const s = thumbSize + (activeSize - thumbSize) * dragProg.value;
        return {
            width: s,
            height: s,
            borderRadius: s / 2,
            marginLeft: -s / 2,
        };
    });

    const jsThumbSize = dragging ? activeSize : thumbSize;

    return (
        <GestureDetector gesture={gesture}>
            <View
                style={[styles.hit, { height: hitHeight }, style]}
                onLayout={onLayout}
                {...accessibility}
            >
                <View
                    style={[
                        styles.track,
                        {
                            height: trackHeight,
                            borderRadius: rad,
                            backgroundColor: trackBg,
                        },
                    ]}
                >
                    <Animated.View
                        style={[
                            styles.seg,
                            fillStyle,
                            { borderRadius: rad, backgroundColor: fill },
                        ]}
                    />
                </View>
                {thumb !== 'never' && (
                    <Animated.View
                        pointerEvents="none"
                        style={[styles.thumbWrap, thumbWrapStyle]}
                    >
                        {renderThumb ? (
                            <View style={{ marginLeft: -jsThumbSize / 2 }}>
                                {renderThumb({
                                    dragging,
                                    size: jsThumbSize,
                                    value: current,
                                })}
                            </View>
                        ) : (
                            <Animated.View
                                style={[dotStyle, { backgroundColor: thumbBg }]}
                            />
                        )}
                    </Animated.View>
                )}
            </View>
        </GestureDetector>
    );
});

const styles = StyleSheet.create({
    hit: {
        alignSelf: 'stretch',
        justifyContent: 'center',
    },
    track: {
        width: '100%',
        overflow: 'hidden',
    },
    seg: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
    },
    thumbWrap: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'flex-start',
    },
});
