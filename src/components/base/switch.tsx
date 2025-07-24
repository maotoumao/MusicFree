import React, { useEffect } from "react";
import {
    StyleSheet,
    SwitchProps,
    TouchableWithoutFeedback,
    View,
} from "react-native";
import useColors from "@/hooks/useColors";
import rpx from "@/utils/rpx";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
import { timingConfig } from "@/constants/commonConst";

interface ISwitchProps extends SwitchProps {}

const fixedWidth = rpx(40);

export default function ThemeSwitch(props: ISwitchProps) {
    const { value, onValueChange } = props;
    const colors = useColors();

    const sharedValue = useSharedValue(value ? 1 : 0);

    useEffect(() => {
        sharedValue.value = value ? 1 : 0;
    }, [value]);

    const thumbStyle = useAnimatedStyle(() => {
        return {
            transform: [
                {
                    translateX: withTiming(
                        sharedValue.value * fixedWidth,
                        timingConfig.animationNormal,
                    ),
                },
            ],
        };
    });

    return (
        <TouchableWithoutFeedback
            onPress={() => {
                onValueChange?.(!value);
            }}>
            <View
                style={[
                    styles.container,
                    {
                        backgroundColor: value
                            ? colors.primary
                            : colors.textSecondary,
                    },
                    props?.style,
                ]}>
                <Animated.View style={[styles.thumb, thumbStyle]} />
            </View>
        </TouchableWithoutFeedback>
    );
}

const styles = StyleSheet.create({
    container: {
        width: rpx(80),
        height: rpx(40),
        borderRadius: rpx(40),
        justifyContent: "center",
    },
    thumb: {
        width: rpx(34),
        height: rpx(34),
        borderRadius: rpx(17),
        backgroundColor: "white",
        left: rpx(3),
    },
});
