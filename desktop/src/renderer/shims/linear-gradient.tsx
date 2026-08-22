/**
 * react-native-linear-gradient 桌面端实现
 * CSS linear-gradient(View)。
 * start/end 支持 {x, y} 与 {x, y, z} 形状,z 分量映射为角度偏移。
 */
import React from "react";
import { View, ViewStyle } from "react-native";

type Point = { x: number; y: number; z?: number };

interface LinearGradientProps {
    colors: (string | number)[];
    start?: Point | number[];
    end?: Point | number[];
    locations?: number[] | null;
    angle?: number;
    useAngle?: boolean;
    style?: ViewStyle | ViewStyle[];
    children?: React.ReactNode;
    [key: string]: any;
}

function normalizeColor(c: string | number): string {
    return String(c);
}

/** 根据 start/end 计算渐变方向角度(CSS deg,0deg = 向上) */
function computeAngle(start?: Point | number[], end?: Point | number[]): number | null {
    const toPoint = (p?: Point | number[]): Point | null => {
        if (!p) return null;
        if (Array.isArray(p)) {
            return { x: p[0] ?? 0.5, y: p[1] ?? 0.5 };
        }
        return p;
    };
    const s = toPoint(start);
    const e = toPoint(end);
    if (!s || !e) return null;
    const dx = e.x - s.x;
    const dy = e.y - s.y;
    if (dx === 0 && dy === 0) return null;
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    // CSS: 0deg 向上,顺时针;数学 atan2: x 向右 y 向上
    // RN 坐标系 y 向下,这里转换为 CSS 角度
    return Math.round((90 - deg * -1 + 360) % 360);
}

export default function LinearGradient(props: LinearGradientProps) {
    const { colors, start, end, locations, angle, useAngle, style, children, ...rest } = props;

    const stops: string[] = [];
    const cs = (colors ?? []).map(normalizeColor);
    if (cs.length === 0) {
        return <View style={style}>{children}</View>;
    }

    for (let i = 0; i < cs.length; i++) {
        const loc = locations?.[i];
        stops.push(typeof loc === "number" ? `${cs[i]} ${(loc * 100).toFixed(2)}%` : cs[i]);
    }

    let cssAngle: string;
    if (useAngle && typeof angle === "number") {
        cssAngle = `${angle}deg`;
    } else {
        const computed = computeAngle(start, end);
        cssAngle = computed !== null ? `${computed}deg` : "180deg";
    }

    return (
        <View
            style={[
                style as ViewStyle,
                {
                    backgroundImage: `linear-gradient(${cssAngle}, ${stops.join(", ")})`,
                } as ViewStyle,
            ]}
            {...rest}
        >
            {children}
        </View>
    );
}
