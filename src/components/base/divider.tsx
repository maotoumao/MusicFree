import React from 'react';
import {StyleProp, StyleSheet, View, ViewProps} from 'react-native';
import useColors from '@/hooks/useColors';

interface IDividerProps {
    vertical?: boolean;
    style?: StyleProp<ViewProps>;
}
export default function Divider(props: IDividerProps) {
    const {vertical, style} = props;
    const colors = useColors();

    return (
        <View
            style={[
                vertical ? css.dividerVertical : css.divider,
                {
                    backgroundColor: colors.divider ?? '#999999',
                },
                style,
            ]}
        />
    );
}

const css = StyleSheet.create({
    divider: {
        width: '100%',
        height: 1,
    },
    dividerVertical: {
        height: '100%',
        width: 1,
    },
});
