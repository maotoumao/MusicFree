/**
 * @react-native-masked-view/masked-view 桌面端实现
 * 项目内当前未实际使用;提供直接透传实现以保证模块可解析。
 */
import React from "react";
import { View, ViewStyle } from "react-native";

interface MaskedViewProps {
    maskElement?: React.ReactNode;
    children?: React.ReactNode;
    style?: ViewStyle | ViewStyle[];
    [key: string]: any;
}

export default function MaskedView(props: MaskedViewProps) {
    const { maskElement, children, style, ...rest } = props;
    // 无遮罩时直接渲染;有 maskElement 时以 children 为主体渲染
    return (
        <View style={style} {...rest}>
            {children ?? maskElement}
        </View>
    );
}
