import deepmerge from 'deepmerge';
import {
    DarkTheme as NavigationDarkTheme,
    DefaultTheme as NavigationDefaultTheme,
} from '@react-navigation/native';
import {
    DarkTheme as PaperDarkTheme,
    DefaultTheme as PaperDefaultTheme,
} from 'react-native-paper';

const _DefaultTheme = deepmerge(PaperDefaultTheme, NavigationDefaultTheme);
const _CustomTheme = deepmerge(PaperDarkTheme, NavigationDarkTheme);

const DefaultTheme = {
    ..._DefaultTheme,
    colors: {
        ..._DefaultTheme.colors,
        primary: '#FDEEDC',
        text: '#333333',
        textSecondary: '#666666',
        textHighlight: '#E38B29',
        background: 'transparent',
        pageBackground: '#FCF8E8',
        backdrop: 'rgba(0,0,0,0.2)',
        accent: '#E38B29',
    },
};

const CustomTheme = {
    ..._CustomTheme,
    colors: {
        ..._CustomTheme.colors,
        primary: '#2b333e',
        text: '#eeeeee',
        textSecondary: '#aaaaaa',
        textHighlight: '#eba0b3',
        background: 'transparent',
        pageBackground: '#1B2430',
        backdrop: 'rgba(0,0,0,0.2)',
        accent: '#eba0b3',
    },
};

export {DefaultTheme, CustomTheme};

/**
 * 所有的颜色:
 * primary: appbar背景色
 * text: 文字
 * textSecondary: 二级文字色
 * textHighlight: 文字选中色
 * background: 页面背景色
 * backdrop: 列表背景色
 *
 *
 */
