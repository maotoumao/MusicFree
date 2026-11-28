import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
    cancelAnimation,
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';

import { duration, easing, radius, useColors } from '@/design';
import { clamp } from '@/utils/number';

/** 轨道厚度（dp）：细轨，随行文字排布而不喧宾夺主 */
const TRACK_HEIGHT = 3;

/** 不确定态里平移的那一小段占轨道的比例 */
const PULSE_RATIO = 0.35;

/** 不确定态跑完一趟的时长（ms）：明显在动，又不至于晃眼 */
const PULSE_DURATION = 1200;

interface ProgressBarProps {
    /**
     * 完成比例 0..1；**省略即不确定态**（一小段来回平移）
     *
     * 总量未知时必须省略而不是传 0：伪造的百分比或填充比例会让用户以为进度停滞，
     * 而实际上只是服务端没给 Content-Length。非有限值（`NaN` / `Infinity`，
     * 例如 `0 / 0` 算出来的比例）同样按未知处理，不当成 0%
     */
    value?: number;
    /**
     * 无障碍描述，例如「已下载 18.4 MB，共 43.8 MB」
     * 必填：轨道本身没有可派生名称的文字，缺了它读屏只会读到一个没有上下文的进度条
     */
    accessibilityLabel: string;
}

/**
 * 细进度轨道：确定进度按比例填充，不确定进度用一小段来回平移
 *
 * 动画只走 `transform`，不动 `width` / `left`——后者每帧都会触发 Yoga 重新布局，
 * 而列表里可能同时有好几条轨道在跑
 *
 * 纯展示，不认业务语义——「多少算完成」「未知总量怎么措辞」都由调用方决定；
 * 设计稿里跟在轨道旁的 spinner 也由调用方摆放，不塞进通用组件
 */
export function ProgressBar({ value, accessibilityLabel }: ProgressBarProps) {
    const colors = useColors();
    // 只有「给了值且是有限数」才算确定进度
    const determinate = value !== undefined && Number.isFinite(value);
    const ratio = useSharedValue(determinate ? clamp01(value) : 0);
    const pulse = useSharedValue(0);
    // 平移距离要按实际宽度算：RN 的 transform 不接受百分比
    const [trackWidth, setTrackWidth] = useState(0);
    const travel = trackWidth * (1 - PULSE_RATIO);

    useEffect(() => {
        if (determinate) return;
        pulse.value = 0;
        pulse.value = withRepeat(
            withTiming(1, {
                duration: PULSE_DURATION,
                easing: Easing.inOut(Easing.ease),
            }),
            -1,
            true, // 往复：跑到头再退回来，不做位置跳变
        );
        return () => cancelAnimation(pulse);
    }, [determinate, pulse]);

    useEffect(() => {
        if (!determinate) return;
        ratio.value = withTiming(clamp01(value), {
            duration: duration.fast,
            easing: easing.standard,
        });
        return () => cancelAnimation(ratio);
    }, [determinate, value, ratio]);

    const fillStyle = useAnimatedStyle(() =>
        determinate
            ? { transform: [{ scaleX: ratio.value }] }
            : { transform: [{ translateX: pulse.value * travel }] },
    );

    return (
        <View
            style={[styles.track, { backgroundColor: colors.surfaceVariant }]}
            onLayout={e => setTrackWidth(e.nativeEvent.layout.width)}
            // 只有 accessibilityRole 不够：View 还须显式 accessible 才会成为无障碍元素
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={accessibilityLabel}
            // 不确定态不报数值：播报 0% 会与「正在获取大小」自相矛盾，改用 busy 表达「在动但说不准」
            accessibilityState={determinate ? undefined : { busy: true }}
            accessibilityValue={
                determinate
                    ? {
                          min: 0,
                          max: 100,
                          now: Math.round(clamp01(value) * 100),
                      }
                    : undefined
            }
        >
            <Animated.View
                style={[
                    styles.fill,
                    determinate
                        ? styles.fullWidth
                        : { width: `${PULSE_RATIO * 100}%` },
                    { backgroundColor: colors.primary },
                    fillStyle,
                ]}
            />
        </View>
    );
}

/** 夹到 0..1；调用方已保证有限，此处只管越界 */
const clamp01 = (value: number) => clamp(value, 0, 1);

const styles = StyleSheet.create({
    track: {
        height: TRACK_HEIGHT,
        borderRadius: radius.full,
        overflow: 'hidden',
    },
    fill: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        borderRadius: radius.full,
    },
    // 确定态铺满再按比例横向缩放；缩放锚在左端，填充才从左往右长
    fullWidth: {
        width: '100%',
        transformOrigin: 'left',
    },
});
