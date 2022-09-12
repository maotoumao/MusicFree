import React from 'react';
import {StyleSheet, TextProps} from 'react-native';
import {fontSizeConst, fontWeightConst} from '@/constants/uiConst';
import {TouchableOpacity} from 'react-native-gesture-handler';
import openUrl from '@/utils/openUrl';
import ThemeText from './themeText';

type ILinkTextProps = TextProps & {
    fontSize?: keyof typeof fontSizeConst;
    fontWeight?: keyof typeof fontWeightConst;
    linkTo?: string;
};

export default function LinkText(props: ILinkTextProps) {
    return (
        <TouchableOpacity
            onPress={() => {
                props?.linkTo && openUrl(props.linkTo);
            }}>
            <ThemeText {...props} style={style.linkText}>
                {props.children}
            </ThemeText>
        </TouchableOpacity>
    );
}

const style = StyleSheet.create({
    linkText: {
        color: '#66ccff',
        textDecorationLine: 'underline',
    },
});
