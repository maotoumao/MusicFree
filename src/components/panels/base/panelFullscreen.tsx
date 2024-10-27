import React, {useCallback, useEffect, useMemo, useRef} from 'react';
import {
    BackHandler,
    DeviceEventEmitter,
    NativeEventSubscription,
    Pressable,
    StyleSheet,
    ViewStyle,
} from 'react-native';

import Animated, {
    Easing,
    EasingFunction,
    runOnJS,
    useAnimatedReaction,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import useColors from '@/hooks/useColors';
import {panelInfoStore} from '../usePanel';
import {vh} from '@/utils/rpx.ts';
import useOrientation from '@/hooks/useOrientation.ts';

const ANIMATION_EASING: EasingFunction = Easing.out(Easing.exp);
const ANIMATION_DURATION = 250;

const timingConfig = {
    duration: ANIMATION_DURATION,
    easing: ANIMATION_EASING,
};

interface IPanelFullScreenProps {
    // 有遮罩
    hasMask?: boolean;
    // 内容
    children?: React.ReactNode;
    // 内容区样式
    containerStyle?: ViewStyle;

    animationType?: 'SlideToTop' | 'Scale';
}

export default function (props: IPanelFullScreenProps) {
    const {
        hasMask,
        containerStyle,
        children,
        animationType = 'SlideToTop',
    } = props;
    const snapPoint = useSharedValue(0);

    const colors = useColors();

    const backHandlerRef = useRef<NativeEventSubscription>();

    const hideCallbackRef = useRef<Function[]>([]);

    const orientation = useOrientation();
    const windowHeight = useMemo(() => vh(100), [orientation]);

    useEffect(() => {
        snapPoint.value = 1;

        if (backHandlerRef.current) {
            backHandlerRef.current?.remove();
            backHandlerRef.current = undefined;
        }
        backHandlerRef.current = BackHandler.addEventListener(
            'hardwareBackPress',
            () => {
                snapPoint.value = 0;
                return true;
            },
        );

        const listenerSubscription = DeviceEventEmitter.addListener(
            'hidePanel',
            (callback?: () => void) => {
                if (callback) {
                    hideCallbackRef.current.push(callback);
                }
                snapPoint.value = 0;
            },
        );

        return () => {
            if (backHandlerRef.current) {
                backHandlerRef.current?.remove();
                backHandlerRef.current = undefined;
            }
            listenerSubscription.remove();
        };
    }, []);

    const maskAnimated = useAnimatedStyle(() => {
        return {
            opacity: withTiming(snapPoint.value * 0.5, timingConfig),
        };
    });

    const panelAnimated = useAnimatedStyle(() => {
        if (animationType === 'SlideToTop') {
            return {
                transform: [
                    {
                        translateY: withTiming(
                            (1 - snapPoint.value) * windowHeight,
                            timingConfig,
                        ),
                    },
                ],
            };
        } else {
            return {
                transform: [
                    {
                        scale: withTiming(
                            0.3 + snapPoint.value * 0.7,
                            timingConfig,
                        ),
                    },
                ],
                opacity: withTiming(snapPoint.value, timingConfig),
            };
        }
    });

    const unmountPanel = useCallback(() => {
        panelInfoStore.setValue({
            name: null,
            payload: null,
        });
        hideCallbackRef.current.forEach(cb => cb?.());
    }, []);

    useAnimatedReaction(
        () => snapPoint.value,
        (result, prevResult) => {
            if (prevResult && result < prevResult && result === 0) {
                runOnJS(unmountPanel)();
            }
        },
        [],
    );
    return (
        <>
            {hasMask ? (
                <Pressable
                    style={style.maskWrapper}
                    onPress={() => {
                        snapPoint.value = withTiming(0, timingConfig);
                    }}>
                    <Animated.View
                        style={[style.maskWrapper, style.mask, maskAnimated]}
                    />
                </Pressable>
            ) : null}
            <Animated.View
                pointerEvents={hasMask ? 'box-none' : undefined}
                style={[
                    style.wrapper,
                    !hasMask
                        ? {
                              backgroundColor: colors.background,
                          }
                        : null,
                    panelAnimated,
                    containerStyle,
                ]}>
                {children}
            </Animated.View>
        </>
    );
}

const style = StyleSheet.create({
    maskWrapper: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 15000,
    },
    mask: {
        backgroundColor: '#000',
        opacity: 0.5,
    },
    wrapper: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        bottom: 0,
        right: 0,
        zIndex: 15010,
        flexDirection: 'column',
    },
    kbContainer: {
        zIndex: 15010,
    },
});
