import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Pressable, StyleSheet} from 'react-native';
import rpx, {vh} from '@/utils/rpx';
import {Divider} from 'react-native-paper';

import usePanel from '../../usePanel';

import Header from './header';
import Body from './body';
import Animated, {
    Easing,
    runOnJS,
    useAnimatedReaction,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import useColors from '@/hooks/useColors';

const ITEM_HEIGHT = rpx(108);
const ITEM_WIDTH = rpx(750);
const WRAPPER_HEIGHT = vh(60) - rpx(104);
const LIST_HEIGHT = vh(60);
const ANIMATION_EASING: Animated.EasingFunction = Easing.out(Easing.exp);
const ANIMATION_DURATION = 250;

const timingConfig = {
    duration: ANIMATION_DURATION,
    easing: ANIMATION_EASING,
};

export default function () {
    const snapPoint = useSharedValue(0);
    // TODO: 奇怪的rerender

    const {unmountPanel} = usePanel();
    const colors = useColors();
    const [loading, setLoading] = useState(true);
    const timerRef = useRef<any>();

    useEffect(() => {
        snapPoint.value = withTiming(1, timingConfig);
        timerRef.current = setTimeout(() => {
            if (loading) {
                // 兜底
                setLoading(false);
            }
        }, 400);

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
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
                {
                    translateY: withTiming(
                        (1 - snapPoint.value) * LIST_HEIGHT,
                        timingConfig,
                    ),
                },
            ],
        };
    });

    const mountPanel = useCallback(() => {
        setLoading(false);
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
            <Animated.View
                style={[
                    style.wrapper,
                    {backgroundColor: colors.primary},
                    panelAnimated,
                ]}>
                <Header />
                <Divider />
                <Body loading={loading} />
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
    },
    mask: {
        backgroundColor: '#333333',
        opacity: 0.5,
    },
    wrapper: {
        position: 'absolute',
        height: vh(60),
        bottom: 0,
        borderTopLeftRadius: rpx(28),
        borderTopRightRadius: rpx(28),
    },
    playListWrapper: {
        minHeight: WRAPPER_HEIGHT,
        minWidth: rpx(750),
        width: rpx(750),
        height: WRAPPER_HEIGHT,
        flex: 1,
    },
    playList: {
        width: rpx(750),
        height: WRAPPER_HEIGHT,
        flex: 1,
    },
    currentPlaying: {
        marginRight: rpx(6),
    },
    musicItem: {
        width: ITEM_WIDTH,
        height: ITEM_HEIGHT,
        paddingHorizontal: rpx(24),
        flexDirection: 'row',
        alignItems: 'center',
    },
    musicItemTitle: {
        flex: 1,
    },
});
