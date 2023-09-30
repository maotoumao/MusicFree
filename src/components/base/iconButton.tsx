import React from 'react';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {ColorKey, iconSizeConst, colorMap} from '@/constants/uiConst';
import {IconProps} from 'react-native-vector-icons/Icon';
import {TapGestureHandler} from 'react-native-gesture-handler';
import {StyleSheet} from 'react-native';
import useColors from '@/hooks/useColors';

interface IIconButtonProps extends IconProps {
    name: string;
    style?: IconProps['style'];
    sizeType?: keyof typeof iconSizeConst;
    fontColor?: ColorKey;
    color?: string;
    onPress?: () => void;
    accessibilityLabel?: string;
}
export function IconButtonWithGesture(props: IIconButtonProps) {
    const {
        name,
        sizeType: size = 'normal',
        fontColor = 'normal',
        onPress,
        style,
        accessibilityLabel,
    } = props;
    const colors = useColors();
    const textSize = iconSizeConst[size];
    const color = colors[colorMap[fontColor]];
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
    const {sizeType = 'normal', fontColor = 'normal', style, color} = props;
    const colors = useColors();
    const size = iconSizeConst[sizeType];

    return (
        <Icon
            {...props}
            color={color ?? colors[colorMap[fontColor]]}
            style={[{minWidth: size}, styles.textCenter, style]}
            size={size}
        />
    );
}

const styles = StyleSheet.create({
    textCenter: {
        height: '100%',
        textAlignVertical: 'center',
    },
});
