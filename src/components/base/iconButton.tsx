import React from 'react';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {ColorKey, iconSizeConst, colorMap} from '@/constants/uiConst';
import {useTheme} from 'react-native-paper';
import {IconProps} from 'react-native-vector-icons/Icon';
import {
    TapGestureHandler,
    TouchableOpacity,
} from 'react-native-gesture-handler';
import {StyleSheet} from 'react-native';

interface IIconButtonProps {
    name: string;
    style?: IconProps['style'];
    size?: keyof typeof iconSizeConst;
    fontColor?: ColorKey;
    onPress?: () => void;
    accessibilityLabel?: string;
}
export function IconButtonWithGesture(props: IIconButtonProps) {
    const {
        name,
        size = 'normal',
        fontColor = 'normal',
        onPress,
        style,
        accessibilityLabel,
    } = props;
    const theme = useTheme();
    const textSize = iconSizeConst[size];
    const color = theme.colors[colorMap[fontColor]];
    return (
        <TapGestureHandler onActivated={onPress}>
            <Icon
                accessible
                accessibilityLabel={accessibilityLabel}
                name={name}
                color={color}
                style={[{minWidth: textSize}, styles.textCenter, style]}
                size={textSize}
            />
        </TapGestureHandler>
    );
}

export default function IconButton(props: IIconButtonProps) {
    const {
        name,
        size = 'normal',
        fontColor = 'normal',
        onPress,
        style,
        accessibilityLabel,
    } = props;
    const theme = useTheme();
    const textSize = iconSizeConst[size];
    const color = theme.colors[colorMap[fontColor]];
    return (
        <TouchableOpacity onPress={onPress}>
            <Icon
                accessible
                accessibilityLabel={accessibilityLabel}
                name={name}
                color={color}
                style={[{minWidth: textSize}, styles.textCenter, style]}
                size={textSize}
            />
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    textCenter: {
        height: '100%',
        textAlignVertical: 'center',
    },
});
