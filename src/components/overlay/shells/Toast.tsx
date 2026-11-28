import { useEffect } from 'react';
import {
    AccessibilityInfo,
    AppState,
    Platform,
    Pressable,
    StyleSheet,
    View,
} from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';

import { usePressAnimation } from '@/components/hooks/usePressAnimation';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import {
    elevation,
    layout,
    pressScale,
    radius,
    space,
    useColors,
    type Colors,
} from '@/design';
import { useT } from '@/i18n';

import { dismissToast } from '../kernel/controller';
import { type ToastEntry, type ToastType } from '../kernel/store';

import type { IconName } from '@/components/ui/icons.generated';
import type { TranslationKey } from '@/i18n';

/** type → 前缀图标语义色（底色统一 surface、文字用默认 text，只图标着色区分类型） */
const TYPE_ICON_COLOR: Record<ToastType, keyof Colors> = {
    success: 'success',
    error: 'danger',
    warning: 'warning',
    info: 'info',
};

/** type → 左侧图标 */
const TYPE_ICON: Record<ToastType, IconName> = {
    success: 'circle-check',
    error: 'circle-x',
    warning: 'triangle-alert',
    info: 'info',
};

/** type → a11y 类型标签 key（读屏播报「类型：消息」） */
const TYPE_LABEL_KEY = {
    success: 'feedback.a11y.success',
    error: 'feedback.a11y.error',
    warning: 'feedback.a11y.warning',
    info: 'feedback.a11y.info',
} as const satisfies Record<ToastType, TranslationKey>;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * 到期自动关；切后台暂停计时、回前台按剩余续（不空耗）
 * timer===undefined 即「未 arm」；arm/pause 各自幂等，避免连续状态事件多扣时长 / 多起 timer
 */
function useAutoDismiss(id: string, duration: number): void {
    useEffect(() => {
        let remaining = duration;
        let startedAt = 0;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const arm = () => {
            if (timer !== undefined || remaining <= 0) {
                return;
            }
            startedAt = Date.now();
            timer = setTimeout(() => dismissToast(id), remaining);
        };
        const pause = () => {
            if (timer === undefined) {
                return;
            }
            clearTimeout(timer);
            timer = undefined;
            remaining = Math.max(0, remaining - (Date.now() - startedAt));
        };
        const sub = AppState.addEventListener('change', state => {
            if (state === 'active') {
                arm();
            } else {
                pause();
            }
        });
        if (AppState.currentState === 'active') {
            arm();
        }
        return () => {
            if (timer !== undefined) {
                clearTimeout(timer);
            }
            sub.remove();
        };
    }, [id, duration]);
}

/** 单条 toast 视图（进出淡入淡出、整块点按即关、读屏公告） */
export function Toast({ entry }: { entry: ToastEntry }) {
    const colors = useColors();
    const t = useT();
    const actionPress = usePressAnimation(pressScale.compact);
    // 读屏标签：前缀类型（错误：<消息>），色盲/读屏都能辨类型
    const a11yLabel = `${t(TYPE_LABEL_KEY[entry.type])}：${entry.message}`;
    useAutoDismiss(entry.id, entry.duration);
    // iOS VoiceOver 不认 accessibilityLiveRegion（Android-only），出现时主动公告
    useEffect(() => {
        if (Platform.OS === 'ios') {
            AccessibilityInfo.announceForAccessibility(a11yLabel);
        }
    }, [a11yLabel]);
    return (
        <Animated.View
            entering={FadeInDown}
            exiting={FadeOutUp}
            accessibilityLiveRegion="polite"
            // 整棵子树（含 bar 的 elevation 阴影）合成为一个 alpha 层随淡入淡出
            // 一起过渡；否则 Android native elevation 阴影不参与 alpha，会先满强度闪出
            needsOffscreenAlphaCompositing
            style={styles.wrap}
        >
            <View
                style={[
                    styles.bar,
                    elevation.md,
                    {
                        backgroundColor: colors.overlaySurface,
                        borderColor: colors.border,
                        shadowColor: colors.shadow,
                    },
                ]}
            >
                <Icon
                    name={TYPE_ICON[entry.type]}
                    size="md"
                    color={TYPE_ICON_COLOR[entry.type]}
                />
                <Pressable
                    onPress={() => dismissToast(entry.id)}
                    accessibilityRole="button"
                    accessibilityLabel={a11yLabel}
                    style={styles.message}
                >
                    <Text size="md" lineHeight="normal" numberOfLines={2}>
                        {entry.message}
                    </Text>
                </Pressable>
                {entry.action ? (
                    <AnimatedPressable
                        onPress={() => {
                            entry.action?.onPress();
                            dismissToast(entry.id);
                        }}
                        onPressIn={actionPress.onPressIn}
                        onPressOut={actionPress.onPressOut}
                        accessibilityRole="button"
                        accessibilityLabel={entry.action.label}
                        style={[styles.action, actionPress.animatedStyle]}
                    >
                        <Text color="primary" size="md" weight="medium">
                            {entry.action.label}
                        </Text>
                    </AnimatedPressable>
                ) : null}
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        alignSelf: 'center',
        width: '100%',
        maxWidth: layout.toastMaxWidth,
        marginTop: space.sm,
    },
    bar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingVertical: space.md,
        paddingHorizontal: space.xl,
        borderRadius: radius.lg,
        borderWidth: StyleSheet.hairlineWidth,
    },
    message: {
        flex: 1,
    },
    action: {
        paddingVertical: space.xs,
        paddingHorizontal: space.sm,
    },
});
