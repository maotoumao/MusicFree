/**
 * 原始色阶：语义层取值来源
 * UI 一律禁止直接引用（只认 @/design 的语义颜色）
 */
export const palette = {
    /* 中性阶：纯中性灰，不带色偏；两端保持纯白 / 纯黑供 alpha 运算 */
    neutral0: '#ffffff',
    neutral50: '#fafafa',
    neutral100: '#f4f4f4',
    neutral150: '#ededed',
    neutral200: '#e0e0e0',
    neutral300: '#c4c4c4',
    neutral400: '#aaaaaa',
    neutral500: '#888888',
    neutral600: '#666666',
    neutral700: '#444444',
    neutral750: '#333333',
    neutral800: '#272727',
    neutral850: '#1c1c1c',
    neutral900: '#161616',
    neutral950: '#101010',
    neutral1000: '#000000',

    /* 品牌暖橙阶：数值越大越深（同中性阶约定）。浅色语境取 500，深色语境（深色主题 + 沉浸播放页）取更亮的 400 */
    brandOrange400: '#ff6f3c',
    brandOrange500: '#f2600a',
    brandOrange550: '#e8590c',
    brandOrange600: '#c2410c',

    red: '#dc2626',
    redBright: '#ef4444',
    green: '#15803d',
    greenBright: '#22c55e',
    amber: '#d97706',
    amberBright: '#e8a317',
    blue: '#0369a1',
    blueBright: '#0284c7',

    /** 沉浸式正在播放页的遮罩基色（onCover 恒定深色） */
    coverVeilDark: '#0a0e15',
} as const;
