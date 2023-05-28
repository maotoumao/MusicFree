import React from 'react';
import {ColorValue, StyleProp, StyleSheet, View, ViewStyle} from 'react-native';
import rpx from '@/utils/rpx';
import ThemeText from '@/components/base/themeText';
import useColors from '@/hooks/useColors';
import {TouchableOpacity} from 'react-native-gesture-handler';

interface ITypeTagProps {
    title: string;
    selected?: boolean;
    onPress?: () => void;
    backgroundColor?: ColorValue;
    style?: StyleProp<ViewStyle>;
}

export default function TypeTag(props: ITypeTagProps) {
    const {
        title,
        onPress,
        selected = false,
        backgroundColor,
        style: _style,
    } = props;
    const colors = useColors();
    return (
        <TouchableOpacity onPress={onPress}>
            <View
                style={[
                    style.wrapper,
                    {
                        backgroundColor: backgroundColor ?? colors.primary,
                    },
                    _style,
                ]}>
                <ThemeText
                    fontSize="subTitle"
                    fontColor={selected ? 'highlight' : 'normal'}>
                    {title}
                </ThemeText>
            </View>
        </TouchableOpacity>
    );
}

const style = StyleSheet.create({
    wrapper: {
        flexGrow: 0,
        paddingHorizontal: rpx(18),
        paddingVertical: rpx(12),
        borderRadius: rpx(26),
        marginHorizontal: rpx(16),
    },
});
