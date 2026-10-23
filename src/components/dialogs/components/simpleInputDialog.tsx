import { fontSizeConst } from "@/constants/uiConst";
import Input from "@/components/base/input";
import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import ThemeText from "@/components/base/themeText";
import rpx from "@/utils/rpx";
import Dialog from "./base";
import { hideDialog } from "../useDialog";

interface ISimpleInputDialogProps {
    title: string;
    content?: string;
    placeholder?: string;
    defaultValue?: string;
    /** 返回 false 可阻止关闭（比如内容不合法） */
    onOk?: (value: string) => void | boolean | Promise<void | boolean>;
}

/**
 * 带一个输入框的通用对话框
 * 注意：Dialog 只接受 children，标题与按钮要用 Dialog.Title / Dialog.Actions
 */
export default function SimpleInputDialog(props: ISimpleInputDialogProps) {
    const { title, content, placeholder, defaultValue, onOk } = props;
    const [value, setValue] = useState(defaultValue ?? "");

    return (
        <Dialog onDismiss={hideDialog}>
            <Dialog.Title withDivider>{title}</Dialog.Title>
            <Dialog.Content>
                {content ? (
                    <ThemeText fontSize="content">{content}</ThemeText>
                ) : null}
                <View style={style.wrapper}>
                    <Input
                        style={[style.input, { fontSize: fontSizeConst.content }]}
                        value={value}
                        onChangeText={setValue}
                        placeholder={placeholder}
                        hasHorizontalPadding={false}
                        numberOfLines={1}
                        autoFocus
                    />
                </View>
            </Dialog.Content>
            <Dialog.Actions
                actions={
                    [
                        {
                            title: "取消",
                            type: "normal",
                            onPress: hideDialog,
                        },
                        {
                            title: "确定",
                            type: "primary",
                            async onPress() {
                                const result = await onOk?.(value);
                                if (result !== false) {
                                    hideDialog();
                                }
                            },
                        },
                    ] as any
                }
            />
        </Dialog>
    );
}

const style = StyleSheet.create({
    wrapper: {
        paddingTop: rpx(12),
    },
    input: {
        width: "100%",
        borderBottomWidth: StyleSheet.hairlineWidth,
        includeFontPadding: false,
        paddingVertical: rpx(8),
    },
});
