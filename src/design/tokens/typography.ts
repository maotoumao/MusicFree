import type { TextStyle } from 'react-native';

/**
 * 字号刻度（dp；App 受控字号，不跟随系统缩放）
 * 实用刻度而非等比刻度：小端步长有意收窄，因为 xs 与 sm 承担不同角色——
 * xs 给 Tag / 时间 / 计数这类密集元信息，sm 给列表副标题，二者需并存且 sm 必须明显可读
 */
export const fontSize = {
    xs: 12,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
} as const;

/**
 * 字重：只有三档
 * 不设 semibold——600 在各平台与系统字体上不保证形成稳定可辨的独立档位
 * （Android API 28 以下会直接归入 normal），留着只会让调用方以为有区别
 */
export const fontWeight = {
    regular: '400',
    medium: '500',
    bold: '700',
} as const satisfies Record<string, TextStyle['fontWeight']>;

/** 行高倍率（乘字号得绝对行高；RN lineHeight 收绝对 dp，故不直接叫 lineHeight 以防误用） */
export const lineHeightMultiplier = {
    tight: 1.25,
    normal: 1.4,
    relaxed: 1.6,
} as const;
