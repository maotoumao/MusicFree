/**
 * react-native-circular-progress-indicator 桌面端实现
 * 原生 SVG 圆环(仅项目用到的 CircularProgressBase 形状)。
 */
import React from "react";
import { View, ViewStyle } from "react-native";

interface CircularProgressBaseProps {
    value: number;
    radius?: number;
    activeStrokeColor?: string;
    activeStrokeWidth?: number;
    inActiveStrokeColor?: string;
    inActiveStrokeWidth?: number;
    inActiveStrokeOpacity?: number;
    duration?: number;
    children?: React.ReactNode;
    style?: ViewStyle;
    /** 顺时针 */
    clockwise?: boolean;
    initialValue?: number;
    maxValue?: number;
    delay?: number;
    dashed?: { width: number; gap: number } | { count: number; width: number; gap: number };
    strokeLinecap?: "round" | "butt" | "square";
    progressFormatter?: (v: number) => string;
    showProgressValue?: boolean;
    title?: string;
    titleStyle?: any;
    titleColor?: string;
    titleFontSize?: number;
    progressValueColor?: string;
    progressValueStyle?: any;
    progressValueFontSize?: number;
    inActiveStrokeLinecap?: "round" | "butt" | "square";
    allowFontScaling?: boolean;
    animatedProps?: any;
    onAnimationComplete?: () => void;
}

export function CircularProgressBase(props: CircularProgressBaseProps) {
    const {
        value,
        radius = 60,
        activeStrokeColor = "#3b5998",
        activeStrokeWidth = 10,
        inActiveStrokeColor = "#1e2a3a",
        inActiveStrokeWidth = 10,
        inActiveStrokeOpacity = 1,
        children,
        style,
        maxValue = 100,
        strokeLinecap = "round",
        clockwise = true,
    } = props;

    const size = (radius + Math.max(activeStrokeWidth, inActiveStrokeWidth)) * 2;
    const clampedValue = Math.min(Math.max(value, 0), maxValue);
    const ratio = maxValue === 0 ? 0 : clampedValue / maxValue;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = clockwise
        ? circumference * (1 - ratio)
        : circumference * (1 + ratio);

    return (
        <View style={[{ width: size, height: size }, style]}>
            <svg
                width={size}
                height={size}
                viewBox={`0 0 ${size} ${size}`}
                style={{ display: "block", transform: "rotate(-90deg)" }}
            >
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={inActiveStrokeColor}
                    strokeWidth={inActiveStrokeWidth}
                    opacity={inActiveStrokeOpacity}
                />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={activeStrokeColor}
                    strokeWidth={activeStrokeWidth}
                    strokeLinecap={strokeLinecap}
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    style={{ transition: "stroke-dashoffset 0.1s linear" }}
                />
            </svg>
            <View
                style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    right: 0,
                    bottom: 0,
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                {children}
            </View>
        </View>
    );
}

/** 项目未使用,提供形状兼容 */
export function CircularProgress(props: CircularProgressBaseProps) {
    return <CircularProgressBase {...props} />;
}

export default { CircularProgress, CircularProgressBase };
