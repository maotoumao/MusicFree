import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
    BackHandler,
    DeviceEventEmitter,
    EmitterSubscription,
    Keyboard,
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
    EasingFunction,
} from 'react-native-reanimated';
import useColors from '@/hooks/useColors';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import useOrientation from '@/hooks/useOrientation';
import {panelInfoStore} from '../usePanel';

const ANIMATION_EASING: EasingFunction = Easing.out(Easing.exp);
const ANIMATION_DURATION = 250;

const timingConfig = {
    duration: ANIMATION_DURATION,
    easing: ANIMATION_EASING,
};

interface IPanelBaseProps {
    keyboardAvoidBehavior?: 'height' | 'padding' | 'position' | 'none';
    height?: number;
    renderBody: (loading: boolean) => JSX.Element;
    awareKeyboard?: boolean;
}

export default function (props: IPanelBaseProps) {
    const {
        height = vh(60),
        renderBody,
        keyboardAvoidBehavior,
        awareKeyboard,
    } = props;
    const snapPoint = useSharedValue(0);

    const colors = useColors();
    const [loading, setLoading] = useState(true); // 是否处于弹出状态
    const timerRef = useRef<any>();
    const safeAreaInsets = useSafeAreaInsets();
    const orientation = useOrientation();
    const useAnimatedBase = useMemo(
        () => (orientation === 'horizontal' ? rpx(750) : height),
        [orientation],
    );

    const backHandlerRef = useRef<NativeEventSubscription>();

    const hideCallbackRef = useRef<Function[]>([]);

    const [keyboardHeight, setKeyboardHeight] = useState(0);

    useEffect(() => {
        snapPoint.value = withTiming(1, timingConfig);

        timerRef.current = setTimeout(() => {
            if (loading) {
                // 兜底
                setLoading(false);
            }
        }, 400);
        if (backHandlerRef.current) {
            backHandlerRef.current.remove();
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

        let keyboardDidShowListener: EmitterSubscription;
        let keyboardDidHideListener: EmitterSubscription;
        if (awareKeyboard) {
            keyboardDidShowListener = Keyboard.addListener(
                'keyboardDidShow',
                event => {
                    setKeyboardHeight(event.endCoordinates.height);
                },
            );

            keyboardDidHideListener = Keyboard.addListener(
                'keyboardDidHide',
                () => {
                    setKeyboardHeight(0);
                },
            );
        }

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
            keyboardDidShowListener?.remove();
            keyboardDidHideListener?.remove();
        };
    }, []);

    const maskAnimated = useAnimatedStyle(() => {
        return {
            opacity: snapPoint.value * 0.5,
        };
    });

    const panelAnimated = useAnimatedStyle(() => {
        return {
            transform: [
                orientation === 'vertical'
                    ? {
                          translateY: (1 - snapPoint.value) * useAnimatedBase,
                      }
                    : {
                          translateX: (1 - snapPoint.value) * useAnimatedBase,
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
            if (
                ((prevResult !== null && result > prevResult) ||
                    prevResult === null) &&
                result > 0.8
            ) {
                runOnJS(mountPanel)();
            }

            if (prevResult && result < prevResult && result === 0) {
                runOnJS(unmountPanel)();
            }
        },
        [],
    );

    const panelBody = (
        <Animated.View
            style={[
                style.wrapper,
                {
                    backgroundColor: colors.backdrop,
                    height:
                        orientation === 'horizontal'
                            ? vh(100) - safeAreaInsets.top
                            : height -
                              (isFinite(keyboardHeight) ? keyboardHeight : 0),
                },
                panelAnimated,
            ]}>
            {renderBody(loading)}
        </Animated.View>
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
            {keyboardAvoidBehavior === 'none' ? (
                panelBody
            ) : (
                <KeyboardAvoidingView
                    style={style.kbContainer}
                    behavior={keyboardAvoidBehavior || 'position'}>
                    {panelBody}
                </KeyboardAvoidingView>
            )}
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
        width: rpx(750),
        bottom: 0,
        right: 0,
        borderTopLeftRadius: rpx(28),
        borderTopRightRadius: rpx(28),
        zIndex: 15010,
    },
    kbContainer: {
        zIndex: 15010,
    },
});
