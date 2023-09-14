import ThemeText from '@/components/base/themeText';
import rpx from '@/utils/rpx';
import React from 'react';
import {StyleSheet} from 'react-native';
import {TouchableOpacity} from 'react-native-gesture-handler';
import {useTheme} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

interface IActionButtonProps {
    iconName: string;
    iconColor?: string;
    title: string;
    action: () => void;
}

export default function ActionButton(props: IActionButtonProps) {
    const {iconName, iconColor, title, action} = props;
    const {colors} = useTheme();
    // rippleColor="rgba(0, 0, 0, .32)"
    return (
        <TouchableOpacity onPress={action} style={style.wrapper}>
            <>
                <Icon
                    accessible={false}
                    name={iconName}
                    color={iconColor ?? colors.text}
                    size={rpx(48)}
                />
                <ThemeText
                    accessible={false}
                    fontSize="subTitle"
                    fontWeight="semibold"
                    style={style.text}>
                    {title}
                </ThemeText>
            </>
        </TouchableOpacity>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(170),
        height: rpx(144),
        flexGrow: 1,
        flexShrink: 0,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
    },
    text: {
        marginTop: rpx(12),
    },
});
