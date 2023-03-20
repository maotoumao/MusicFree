import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
    BackHandler,
    DeviceEventEmitter,
    KeyboardAvoidingView,
    NativeEventSubscription,
    Pressable,
    StyleSheet,
} from 'react-native';
import rpx, {vh} from '@/utils/rpx';

import Animated, {
    Easing,
    runOnJS,
    useAnimatedReaction,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import useColors from '@/hooks/useColors';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import useOrientation from '@/hooks/useOrientation';
import {panelInfoStore} from '../usePanel';

const ANIMATION_EASING: Animated.EasingFunction = Easing.out(Easing.exp);
const ANIMATION_DURATION = 250;

const timingConfig = {
    duration: ANIMATION_DURATION,
    easing: ANIMATION_EASING,
};

interface IPanelBaseProps {
    height?: number;
    renderBody: (loading: boolean) => JSX.Element;
}

export default function (props: IPanelBaseProps) {
    const {height = vh(60), renderBody} = props;
    const snapPoint = useSharedValue(0);

    const colors = useColors();
    const [loading, setLoading] = useState(true); // 是否处于弹出状态
    const timerRef = useRef<any>();
    const safeAreaInsets = useSafeAreaInsets();
    const orientation = useOrientation();
    const useAnimatedBase = useMemo(
        () => (orientation === 'horizonal' ? rpx(750) : height),
        [orientation],
    );
    const backHandlerRef = useRef<NativeEventSubscription>();

    const hideCallbackRef = useRef<Function[]>([]);

    useEffect(() => {
        snapPoint.value = withTiming(1, timingConfig);
        timerRef.current = setTimeout(() => {
            if (loading) {
                // 兜底
                setLoading(false);
            }
        }, 400);
        if (backHandlerRef.current) {
            backHandlerRef.current?.remove();
            backHandlerRef.current = undefined;
        }
        backHandlerRef.current = BackHandler.addEventListener(
            'hardwareBackPress',
            () => {
                snapPoint.value = withTiming(0, timingConfig);
                return true;
            },
        );

        const listenerSubscription = DeviceEventEmitter.addListener(
            'hidePanel',
            (callback?: () => void) => {
                if (callback) {
                    hideCallbackRef.current.push(callback);
                }
                snapPoint.value = withTiming(0, timingConfig);
            },
        );

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
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
        return {
            transform: [
                orientation === 'vertical'
                    ? {
                          translateY: withTiming(
                              (1 - snapPoint.value) * useAnimatedBase,
                              timingConfig,
                          ),
                      }
                    : {
                          translateX: withTiming(
                              (1 - snapPoint.value) * useAnimatedBase,
                              timingConfig,
                          ),
                      },
            ],
        };
    }, [orientation]);

    const mountPanel = useCallback(() => {
        setLoading(false);
    }, []);

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
            if (prevResult && result > prevResult && result > 0.8) {
                runOnJS(mountPanel)();
            }
            if (prevResult && result < prevResult && result === 0) {
                runOnJS(unmountPanel)();
            }
        },
        [],
    );

    return (
        <>
            <Pressable
                style={style.maskWrapper}
                onPress={() => {
                    snapPoint.value = withTiming(0, timingConfig);
                }}>
                <Animated.View
                    style={[style.maskWrapper, style.mask, maskAnimated]}
                />
            </Pressable>
            <KeyboardAvoidingView behavior="position">
                <Animated.View
                    style={[
                        style.wrapper,
                        {
                            backgroundColor: colors.primary,
                            height:
                                orientation === 'horizonal'
                                    ? vh(100) - safeAreaInsets.top
                                    : height,
                        },
                        panelAnimated,
                    ]}>
                    {renderBody(loading)}
                </Animated.View>
            </KeyboardAvoidingView>
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
    },
    mask: {
        backgroundColor: '#333333',
        opacity: 0.5,
    },
    wrapper: {
        position: 'absolute',
        width: rpx(750),
        bottom: 0,
        right: 0,
        borderTopLeftRadius: rpx(28),
        borderTopRightRadius: rpx(28),
    },
});
