import React from 'react';
import rpx from '@/utils/rpx';
import {StyleSheet, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {fontSizeConst} from '@/constants/uiConst';

interface IToastBaseProps {
    text: string;
    iconName: string;
    iconColor: string;
}
function ToastBase(props: IToastBaseProps) {
    const {text, iconName, iconColor} = props;
    return (
        <View style={styles.toastBasic}>
            <Icon style={styles.icon} name={iconName} color={iconColor} />
            <Text style={styles.text} numberOfLines={2}>
                {text}
            </Text>
        </View>
    );
}

const toastConfig = {
    success: ({text1}: any) => (
        <ToastBase text={text1} iconName="check-circle" iconColor="#457236" />
    ),
    warn: ({text1}: any) => (
        <ToastBase text={text1} iconName="alert-circle" iconColor="#de7622" />
    ),
};

export default toastConfig;

const styles = StyleSheet.create({
    toastBasic: {
        width: rpx(600),
        height: rpx(84),
        borderRadius: rpx(48),
        backgroundColor: '#fbeee2',
        flexDirection: 'row',
        alignItems: 'center',
    },
    text: {
        fontSize: fontSizeConst.content,
        includeFontPadding: false,
        marginLeft: fontSizeConst.tag,
        width: rpx(488),
        color: '#333333',
    },
    icon: {
        fontSize: fontSizeConst.appbar,
        includeFontPadding: false,
        marginLeft: fontSizeConst.content,
    },
});
