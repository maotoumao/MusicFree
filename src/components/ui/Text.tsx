import {
    Text as RNText,
    type StyleProp,
    type TextProps as RNTextProps,
    type TextStyle,
} from 'react-native';

import { useOnSubstrate } from '@/components/layout/SubstrateScope';
import {
    useColors,
    useTextShadow,
    fontSize,
    fontWeight,
    lineHeightMultiplier,
    type Colors,
} from '@/design';

/** 可透传的文本样式：token 受控属性（色/字号/字重/行高/字体族/自适配阴影）不可从 style 覆盖 */
type TextStyleOverride = Omit<
    TextStyle,
    | 'color'
    | 'fontSize'
    | 'fontWeight'
    | 'lineHeight'
    | 'fontFamily'
    | 'textShadowColor'
    | 'textShadowOffset'
    | 'textShadowRadius'
>;

interface TextProps extends Omit<RNTextProps, 'style' | 'allowFontScaling'> {
    /** 语义颜色 token（默认 text） */
    color?: keyof Colors;
    /** 字号 token（默认 md） */
    size?: keyof typeof fontSize;
    /** 字重 token（默认 regular） */
    weight?: keyof typeof fontWeight;
    /** 行高倍率 token；给了才算绝对行高 = 字号 × 倍率 */
    lineHeight?: keyof typeof lineHeightMultiplier;
    /** 透传样式：italic/下划线等；token 受控属性（色/字号/字重/行高/字体族）不可覆盖 */
    style?: StyleProp<TextStyleOverride>;
}

/** 文本原子：只认语义 token；italic/下划线等经 style 透传。全局不跟随系统字号缩放 */
export function Text({
    color = 'text',
    size = 'md',
    weight = 'regular',
    lineHeight,
    style,
    ...rest
}: TextProps) {
    const colors = useColors();
    // 背景图上对比度不足时由主题给出兜底阴影；不改文字色，够对比时为 undefined
    // 只在坐于页面基底的子树生效：弹窗与沉浸播放页有自己的实色面，加阴影只是脏污
    const onSubstrate = useOnSubstrate();
    const textShadow = useTextShadow();
    const tokenStyle = {
        ...(onSubstrate ? textShadow : undefined),
        color: colors[color],
        fontSize: fontSize[size],
        fontWeight: fontWeight[weight],
        lineHeight: lineHeight
            ? fontSize[size] * lineHeightMultiplier[lineHeight]
            : undefined,
        includeFontPadding: false,
        textAlignVertical: 'center' as const,
    };
    return (
        <RNText
            {...rest}
            allowFontScaling={false}
            style={[style, tokenStyle]}
        />
    );
}
