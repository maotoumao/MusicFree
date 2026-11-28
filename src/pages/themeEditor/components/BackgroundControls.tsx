import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useSliderPreview } from '@/components/hooks/useSliderPreview';
import { Button } from '@/components/ui/Button';
import { Slider } from '@/components/ui/Slider';
import { Text } from '@/components/ui/Text';
import {
    THEME_BACKGROUND_BLUR_MAX,
    THEME_BACKGROUND_BLUR_MIN,
} from '@/core/theme';
import { layout, space } from '@/design';
import { useT } from '@/i18n';

import type { BackgroundShape } from '../hooks/useBackgroundEditor';
import type { ThemeBackground } from '@/core/theme';
import type { SharedValue } from 'react-native-reanimated';

interface BackgroundControlsProps {
    background: ThemeBackground | null;
    busy: boolean;
    /** 与 BackgroundStage 共享的实时值：拖动中直写，松手才提交 */
    liveScale: SharedValue<number>;
    liveVeil: SharedValue<number>;
    /** 进行中的交互计数：拖动期间 +1，让预览层盖上来跟手 */
    activeInteractions: SharedValue<number>;
    /** 手势结束到烘焙开始之间的接力标记 */
    pendingCommit: SharedValue<number>;
    onPick(): void;
    onRemove(): void;
    onReshape(shape: BackgroundShape): void;
    onLayers(visibility: number, surfaceOpacity: number): void;
}

const SCALE_MIN = 1;
const SCALE_MAX = 3;

/**
 * 背景控制区：选图 / 移除 + 模糊、缩放、背景可见度、控件不透明度四档
 *
 * 可见度与不透明度都不设下限——用户可以让壁纸全裸、也可以让控件全透明；
 * 拿不准时随时可切回内置主题，可逆性替代强制约束。
 */
function BackgroundControls({
    background,
    busy,
    liveScale,
    liveVeil,
    activeInteractions,
    pendingCommit,
    onPick,
    onRemove,
    onReshape,
    onLayers,
}: BackgroundControlsProps) {
    const t = useT();
    // 形状类改动要等烘焙落库，滑块先乐观自持，落库后再由 background 校正
    const [blurRadius, setBlurRadius] = useState(background?.blurRadius ?? 0);
    const [scale, setScale] = useState(background?.scale ?? SCALE_MIN);
    // 拖动中切走页签会卸载本组件，onChangeCancel 不会触发：收尾时归还自己增过的次数。
    // 只能还自己那一份——计数是与背景拖动手势共用的，直接清零会把还在进行的手势掐掉
    const heldRef = useRef(0);
    useEffect(
        () => () => {
            activeInteractions.value = Math.max(
                0,
                activeInteractions.value - heldRef.current,
            );
            heldRef.current = 0;
        },
        [activeInteractions],
    );
    // 烘焙期间不回灌 core 的旧值：形状改动要等位图落库，中途同步会让滑块回跳一下
    useEffect(() => {
        if (background && !busy) {
            setBlurRadius(background.blurRadius);
            setScale(background.scale);
        }
    }, [background, busy]);

    if (!background) {
        return (
            <View style={styles.empty}>
                <Text size="sm" color="textSecondary">
                    {t('themeEditor.background.empty')}
                </Text>
                <Button icon="image" onPress={onPick} loading={busy}>
                    {t('themeEditor.background.select')}
                </Button>
            </View>
        );
    }

    const shape = (next: Partial<BackgroundShape>): BackgroundShape => ({
        blurRadius,
        focusX: background.focusX,
        focusY: background.focusY,
        scale,
        ...next,
    });

    return (
        <View style={styles.root}>
            <View style={styles.actions}>
                <Button
                    variant="outline"
                    icon="image"
                    onPress={onPick}
                    disabled={busy}
                    style={styles.action}
                >
                    {t('themeEditor.background.replace')}
                </Button>
                <Button
                    variant="outline"
                    tone="danger"
                    onPress={onRemove}
                    disabled={busy}
                    style={styles.action}
                >
                    {t('themeEditor.background.remove')}
                </Button>
            </View>

            <ControlSlider
                label={t('themeEditor.background.blur')}
                value={blurRadius}
                min={THEME_BACKGROUND_BLUR_MIN}
                max={THEME_BACKGROUND_BLUR_MAX}
                step={1}
                format={value => String(Math.round(value))}
                disabled={busy}
                onChangeEnd={next => {
                    setBlurRadius(next);
                    pendingCommit.value = 1;
                    onReshape(shape({ blurRadius: next }));
                }}
            />
            <ControlSlider
                label={t('themeEditor.background.scale')}
                value={scale}
                min={SCALE_MIN}
                max={SCALE_MAX}
                step={0.05}
                format={value => `${value.toFixed(2)}×`}
                disabled={busy}
                onChangeStart={() => {
                    heldRef.current += 1;
                    activeInteractions.value += 1;
                }}
                onChange={next => {
                    liveScale.value = next;
                }}
                onChangeEnd={next => {
                    setScale(next);
                    liveScale.value = next;
                    // 先接力再释放：中间不能出现两者同时为 0 的窗口
                    pendingCommit.value = 1;
                    releaseInteraction(activeInteractions, heldRef);
                    onReshape(shape({ scale: next }));
                }}
                onChangeCancel={() => {
                    liveScale.value = scale;
                    releaseInteraction(activeInteractions, heldRef);
                }}
            />
            <ControlSlider
                label={t('themeEditor.background.visibility')}
                value={background.visibility}
                min={0}
                max={1}
                step={0.01}
                format={value => `${Math.round(value * 100)}%`}
                disabled={busy}
                onChangeStart={() => {
                    heldRef.current += 1;
                    activeInteractions.value += 1;
                }}
                onChange={next => {
                    liveVeil.value = 1 - next;
                }}
                onChangeEnd={next => {
                    liveVeil.value = 1 - next;
                    releaseInteraction(activeInteractions, heldRef);
                    onLayers(next, background.surfaceOpacity);
                }}
                onChangeCancel={() => {
                    liveVeil.value = 1 - background.visibility;
                    releaseInteraction(activeInteractions, heldRef);
                }}
            />
            <ControlSlider
                label={t('themeEditor.background.surfaceOpacity')}
                value={background.surfaceOpacity}
                min={0}
                max={1}
                step={0.01}
                format={value => `${Math.round(value * 100)}%`}
                disabled={busy}
                onChangeEnd={next => onLayers(background.visibility, next)}
            />

            <Text size="sm" color="textSecondary">
                {t('themeEditor.background.positionHint')}
            </Text>
        </View>
    );
}

/**
 * 归还一次交互计数并同步本组件持有的份额
 * 无障碍加减档只调 onChangeEnd、没有配对的 onChangeStart，故 held 也要防到 0 以下
 */
function releaseInteraction(
    counter: SharedValue<number>,
    held: { current: number },
): void {
    if (held.current === 0) {
        return;
    }
    held.current -= 1;
    counter.value = Math.max(0, counter.value - 1);
}

/** 带标签与当前值的一行滑块；数值随拖动实时走 */
function ControlSlider({
    label,
    value,
    min,
    max,
    step,
    format,
    disabled,
    onChangeStart,
    onChange,
    onChangeEnd,
    onChangeCancel,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    /** 值 → 展示文案；拖动中喂的是手势值，故不能在外面提前算好 */
    format: (value: number) => string;
    disabled?: boolean;
    onChangeStart?: () => void;
    onChange?: (value: number) => void;
    onChangeEnd: (value: number) => void;
    onChangeCancel?: () => void;
}) {
    const preview = useSliderPreview(value, {
        onChange,
        onChangeEnd,
        onChangeCancel,
    });
    return (
        <View style={styles.control}>
            <View style={styles.controlLabel}>
                <Text>{label}</Text>
                <Text size="sm" color="textSecondary">
                    {format(preview.displayValue)}
                </Text>
            </View>
            <Slider
                value={value}
                min={min}
                max={max}
                step={step}
                disabled={disabled}
                onChangeStart={onChangeStart}
                onChange={preview.onChange}
                onChangeEnd={preview.onChangeEnd}
                onChangeCancel={preview.onChangeCancel}
                accessibilityLabel={label}
                // 朗读已提交值而非拖动值：读屏用的是加减档（只走 onChangeEnd），
                // 且每帧变文案会让 memo 过的 Slider 白白重渲
                accessibilityValueText={format(value)}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        paddingHorizontal: layout.screenGutter,
        paddingVertical: space.md,
        gap: space.sm,
    },
    empty: {
        paddingHorizontal: layout.screenGutter,
        // 上下不对称：面板里它是唯一内容，往下坐一点才不贴着 Tabs
        paddingTop: space['2xl'],
        paddingBottom: space.xl,
        alignItems: 'center',
        gap: space.md,
    },
    actions: {
        flexDirection: 'row',
        gap: space.sm,
    },
    action: { flex: 1 },
    control: {
        gap: space.xs,
        paddingVertical: space.xs,
    },
    controlLabel: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
});

export { BackgroundControls };
