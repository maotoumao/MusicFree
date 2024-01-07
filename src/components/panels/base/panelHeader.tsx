import React from 'react';
import {StyleProp, StyleSheet, View, ViewStyle} from 'react-native';
import rpx from '@/utils/rpx';
import {TouchableOpacity} from 'react-native-gesture-handler';
import ThemeText from '@/components/base/themeText';
import Divider from '@/components/base/divider';

interface IPanelHeaderProps {
    title: string;
    cancelText?: string;
    okText?: string;
    onCancel?: () => void;
    onOk?: () => void;
    hideButtons?: boolean;
    hideDivider?: boolean;
    style?: StyleProp<ViewStyle>;
}
export default function PanelHeader(props: IPanelHeaderProps) {
    const {
        title,
        cancelText,
        okText,
        onOk,
        onCancel,
        hideButtons,
        hideDivider,
        style,
    } = props;

    return (
        <>
            <View style={[styles.header, style]}>
                {hideButtons ? null : (
                    <TouchableOpacity style={styles.button} onPress={onCancel}>
                        <ThemeText fontWeight="medium">
                            {cancelText || '取消'}
                        </ThemeText>
                    </TouchableOpacity>
                )}
                <ThemeText
                    style={styles.title}
                    fontWeight="bold"
                    fontSize="title"
                    numberOfLines={1}>
                    {title}
                </ThemeText>
                {hideButtons ? null : (
                    <TouchableOpacity
                        style={[styles.button, styles.rightButton]}
                        onPress={onOk}>
                        <ThemeText fontWeight="medium" fontColor="primary">
                            {okText || '确认'}
                        </ThemeText>
                    </TouchableOpacity>
                )}
            </View>
            {hideDivider ? null : <Divider />}
        </>
    );
}

const styles = StyleSheet.create({
    header: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: rpx(24),
        height: rpx(100),
    },
    button: {
        width: rpx(120),
        height: '100%',
        justifyContent: 'center',
    },
    rightButton: {
        alignItems: 'flex-end',
    },
    title: {
        flex: 1,
        textAlign: 'center',
    },
});
