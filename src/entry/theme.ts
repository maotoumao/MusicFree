import {
    DarkTheme as NavigationDarkTheme,
    DefaultTheme as NavigationDefaultTheme,
} from '@react-navigation/native';

const _DefaultTheme = NavigationDefaultTheme;
const _CustomTheme = NavigationDarkTheme;

const DefaultThemeNew = {
    ..._DefaultTheme,
    colors: {
        ..._DefaultTheme.colors,
        primary: '#f17d34',
        background: '#fafafa',
        divider: 'rgba(0,0,0,0.1)',
        text: '#333333',
        listActive: 'rgba(0,0,0,0.1)', // 在手机上表现是ripple
        mask: 'rgba(51,51,51,0.2)',
        shadow: 'rgba(0, 0, 0, 0.2)',
        backdrop: '#f0f0f0',
        placeholder: '#eaeaea',
        success: '#08A34C',
        danger: '#FC5F5F',
        info: '#0A95C8',
        musicBar: '#fff',
        headerText: '#fefefe',
    },
};

// const DefaultTheme = {
//     ..._DefaultTheme,
//     colors: {
//         ..._DefaultTheme.colors,
//         primary: '#FDEEDC',
//         text: '#333333',
//         textSecondary: '#666666',
//         textHighlight: '#E38B29',
//         background: 'transparent',
//         pageBackground: '#FCF8E8',
//         backdrop: 'rgba(0,0,0,0.2)',
//         accent: '#E38B29',
//     },
// };

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

export {DefaultThemeNew as DefaultTheme, CustomTheme};

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
