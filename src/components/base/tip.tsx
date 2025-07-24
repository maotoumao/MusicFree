import React, { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, LayoutRectangle, Text } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    runOnJS,
} from "react-native-reanimated";
import Portal from "./portal";
import rpx from "@/utils/rpx";
import useColors from "@/hooks/useColors";
import { timingConfig } from "@/constants/commonConst";

type TipPosition = "top" | "bottom" | "left" | "right";

interface ITipProps {
    children: ReactNode;
    content: string;
    position?: TipPosition;
    autoHideDuration?: number; // 自动消失时间，单位毫秒，0表示不自动消失
    backgroundColor?: string;
    textColor?: string;
    triangleSize?: number;
}

interface ITipPortalProps {
    content: string;
    position: TipPosition;
    childRect: LayoutRectangle;
    backgroundColor: string;
    textColor: string;
    triangleSize: number;
    visible: boolean;
    onHide: () => void;
    autoHideDuration: number;
}

// 计算tip的位置和三角形位置
const calculateTipPosition = (
    childRect: LayoutRectangle,
    tipWidth: number,
    tipHeight: number,
    position: TipPosition,
    triangleSize: number
) => {
    const margin = rpx(12);
    let tipLeft = 0;
    let tipTop = 0;
    let triangleLeft = 0;
    let triangleTop = 0;
    let triangleRotation = 0; switch (position) {
    case "top":
        tipLeft = childRect.x + childRect.width / 2 - tipWidth / 2;
        tipTop = childRect.y - tipHeight - margin - triangleSize;
        triangleLeft = tipWidth / 2 - triangleSize / 2;
        triangleTop = tipHeight;
        triangleRotation = 180; // 指向下方
        break;
    case "bottom":
        tipLeft = childRect.x + childRect.width / 2 - tipWidth / 2;
        tipTop = childRect.y + childRect.height + margin + triangleSize;
        triangleLeft = tipWidth / 2 - triangleSize / 2;
        triangleTop = -triangleSize;
        triangleRotation = 0; // 指向上方
        break;
    case "left":
        tipLeft = childRect.x - tipWidth - margin - triangleSize;
        tipTop = childRect.y + childRect.height / 2 - tipHeight / 2;
        triangleLeft = tipWidth;
        triangleTop = tipHeight / 2 - triangleSize / 2;
        triangleRotation = 90; // 指向右方
        break;
    case "right":
        tipLeft = childRect.x + childRect.width + margin + triangleSize;
        tipTop = childRect.y + childRect.height / 2 - tipHeight / 2;
        triangleLeft = -triangleSize;
        triangleTop = tipHeight / 2 - triangleSize / 2;
        triangleRotation = -90; // 指向左方
        break;
    }

    return {
        tipLeft,
        tipTop,
        triangleLeft,
        triangleTop,
        triangleRotation,
    };
};

// 三角形组件
const Triangle = ({ size, color, style }: { size: number; color: string; style?: any }) => (
    <View
        style={[
            {
                width: 0,
                height: 0,
                borderLeftWidth: size / 2,
                borderRightWidth: size / 2,
                borderBottomWidth: size,
                borderLeftColor: "transparent",
                borderRightColor: "transparent",
                borderBottomColor: color,
            },
            style,
        ]}
    />
);

// Tip内容Portal组件
const TipPortal = ({
    content,
    position,
    childRect,
    backgroundColor,
    textColor,
    triangleSize,
    visible,
    onHide,
    autoHideDuration,
}: ITipPortalProps) => {
    const opacity = useSharedValue(0);
    const scale = useSharedValue(0.8);
    const [tipDimensions, setTipDimensions] = useState({ width: 0, height: 0 });
    const [shouldRender, setShouldRender] = useState(visible);

    useEffect(() => {
        if (visible) {
            setShouldRender(true);
            // 显示动画
            opacity.value = withTiming(1, timingConfig.animationNormal);
            scale.value = withTiming(1, timingConfig.animationNormal);

            // 自动隐藏
            if (autoHideDuration > 0) {
                const hideTimer = setTimeout(() => {
                    // 开始隐藏动画
                    opacity.value = withTiming(0, timingConfig.animationNormal, (finished) => {
                        if (finished) {
                            runOnJS(onHide)();
                        }
                    });
                    scale.value = withTiming(0.8, timingConfig.animationNormal);
                }, autoHideDuration);

                return () => clearTimeout(hideTimer);
            }
        } else {
            // 隐藏动画
            opacity.value = withTiming(0, timingConfig.animationNormal, (finished) => {
                if (finished) {
                    runOnJS(setShouldRender)(false);
                }
            });
            scale.value = withTiming(0.8, timingConfig.animationNormal);
        }
    }, [visible, autoHideDuration, onHide, opacity, scale]);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            opacity: opacity.value,
            transform: [{ scale: scale.value }],
        };
    });

    const handleLayout = useCallback((event: any) => {
        const { width, height } = event.nativeEvent.layout;
        setTipDimensions({ width, height });
    }, []);

    // 如果不需要渲染，直接返回null
    if (!shouldRender) {
        return null;
    } if (tipDimensions.width === 0 || tipDimensions.height === 0) {
        // 测量阶段，先渲染不可见的tip来获取尺寸
        return (
            <View
                style={[styles.tipContainer, styles.measurementContainer]}
                onLayout={handleLayout}
            >
                <Text style={[styles.tipText, { color: textColor }]}>{content}</Text>
            </View>
        );
    }

    const { tipLeft, tipTop, triangleLeft, triangleTop, triangleRotation } = calculateTipPosition(
        childRect,
        tipDimensions.width,
        tipDimensions.height,
        position,
        triangleSize
    );

    return (
        <Animated.View
            style={[
                styles.tipContainer,
                {
                    backgroundColor,
                    left: tipLeft,
                    top: tipTop,
                },
                animatedStyle,
            ]}
        >
            <Text style={[styles.tipText, { color: textColor }]}>{content}</Text>
            <View
                style={[
                    styles.triangle,
                    {
                        left: triangleLeft,
                        top: triangleTop,
                        transform: [{ rotate: `${triangleRotation}deg` }],
                    },
                ]}
            >
                <Triangle size={triangleSize} color={backgroundColor} />
            </View>
        </Animated.View>
    );
};

export default function Tip({
    children,
    content,
    position = "top",
    autoHideDuration = 3000,
    backgroundColor,
    textColor,
    triangleSize = rpx(12),
}: ITipProps) {
    const colors = useColors();
    const [visible, setVisible] = useState(false);
    const [childRect, setChildRect] = useState<LayoutRectangle | null>(null);
    const childRef = useRef<View>(null);

    const finalBackgroundColor = backgroundColor || colors.notification;
    const finalTextColor = textColor || colors.text;

    const handlePress = useCallback(() => {
        if (!childRef.current) return;

        childRef.current.measure((x, y, width, height, pageX, pageY) => {
            setChildRect({
                x: pageX,
                y: pageY,
                width,
                height,
            });
            setVisible(true);
        });
    }, []);

    const handleHide = useCallback(() => {
        setVisible(false);
    }, []);

    const tap = Gesture.Tap().onStart(() => {
        runOnJS(handlePress)();
    });

    return (
        <>
            <GestureDetector gesture={tap}>
                <View ref={childRef}>{children}</View>
            </GestureDetector>
            {visible && childRect && (
                <Portal>
                    <TipPortal
                        content={content}
                        position={position}
                        childRect={childRect}
                        backgroundColor={finalBackgroundColor}
                        textColor={finalTextColor}
                        triangleSize={triangleSize}
                        visible={visible}
                        onHide={handleHide}
                        autoHideDuration={autoHideDuration}
                    />
                </Portal>
            )}
        </>
    );
}

const styles = StyleSheet.create({
    tipContainer: {
        position: "absolute",
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        paddingHorizontal: rpx(16),
        paddingVertical: rpx(8),
        borderRadius: rpx(8),
        maxWidth: rpx(300),
        zIndex: 9999,
    },
    measurementContainer: {
        opacity: 0,
        position: "absolute",
        top: -1000,
    },
    tipText: {
        fontSize: rpx(24),
        lineHeight: rpx(32),
        textAlign: "center",
    },
    triangle: {
        position: "absolute",
    },
});