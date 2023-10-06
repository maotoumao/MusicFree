import {useTheme, Theme} from '@react-navigation/native';
import Color from 'color';
import {useMemo} from 'react';

type IColors = Theme['colors'];

export interface CustomizedColors extends IColors {
    /** 二级颜色 */
    secondary?: string;
    /** 普通文字 */
    text: string;
    /** 副标题文字颜色 */
    textSecondary?: string;
    /** 高亮文本颜色 */
    textHighlight?: string;
    /** 背景高亮颜色 */
    backgroundHighlight?: string;
    /** 页面背景 */
    pageBackground?: string;
    /** 阴影 */
    shadow?: string;
    /** 标题栏颜色 */
    appBar?: string;
    /** 音乐栏颜色 */
    musicBar?: string;
    /** 分割线 */
    divider?: string;
    /** 标题字体，和primary对比的字体 */
    headerText?: string;
    /** 高亮颜色 */
    listActive?: string;
    /** 输入框背景色 */
    placeholder?: string;
    /** 菜单背景色 */
    backdrop?: string;
}

export default function useColors() {
    const {colors} = useTheme();

    const cColors: CustomizedColors = useMemo(() => {
        return {
            ...colors,
            // @ts-ignore
            textSecondary:
                colors.textSecondary ??
                Color(colors.text).alpha(0.6).toString(),
            // @ts-ignore
            background: colors._background ?? colors.background,
        };
    }, [colors]);

    return cColors;
}
