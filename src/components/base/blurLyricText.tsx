import React from "react";
import { requireNativeComponent } from "react-native";

/**
 * 原生模糊歌词行视图 (Android)
 * Canvas + BlurMaskFilter 真高斯模糊, blurRadius=0 时完全清晰
 */
interface INativeBlurLyricTextProps {
    text?: string;
    fontSize?: number;
    color?: string;
    blurRadius?: number;
    style?: object;
    onLayout?: (event: { nativeEvent: { layout: { width: number; height: number } } }) => void;
}

const NativeBlurLyricText =
    requireNativeComponent<INativeBlurLyricTextProps>("BlurLyricView");

interface IBlurLyricTextProps {
    text?: string;
    /** 字号 (RN px) */
    fontSize?: number;
    /** 文字颜色 (css 颜色字符串) */
    color?: string;
    /** 模糊半径 (dp), 0 = 清晰 */
    blurRadius?: number;
    style?: object;
    onLayout?: (event: {
        nativeEvent: {
            layout: { width: number; height: number };
        };
    }) => void;
}

export default function BlurLyricText(props: IBlurLyricTextProps) {
    const { text, fontSize, color, blurRadius, style, onLayout } = props;
    return (
        <NativeBlurLyricText
            text={text ?? ""}
            fontSize={fontSize}
            color={color}
            blurRadius={blurRadius}
            style={style}
            onLayout={onLayout}
        />
    );
}
