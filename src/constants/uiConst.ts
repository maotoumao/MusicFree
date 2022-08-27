import rpx from '@/utils/rpx';

const fontSizeConst = {
  /** 16 */
  smallest: rpx(16),
  /** 20 */
  smaller: rpx(20),
  /** 24 */
  small: rpx(24),
  /** 28 */
  normal: rpx(28),
  /** 32 */
  big: rpx(32),
  /** 36 */
  bigger: rpx(36),
  /** 40 */
  biggest: rpx(40),

  /** 标签 */
  tag: rpx(20),
  /** 描述文本等字体 */
  description: rpx(22),
  /** 副标题 */
  subTitle: rpx(26),
  /** 正文字体 */
  content: rpx(28),
  /** 标题字体 */
  title: rpx(32),
  /** appbar的字体 */
  appbar: rpx(36),
};

const fontWeightConst = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  bolder: '800',

} as const;

const iconSizeConst = {
  small: rpx(32),
  normal: rpx(48),
  big: rpx(64)
}

type ColorKey = 'normal' | 'secondary' | 'highlight';
const colorMap: Record<ColorKey, keyof ReactNativePaper.ThemeColors> = {
  normal: 'text',
  secondary: 'textSecondary',
  highlight: 'textHighlight',
} as const;


export {fontSizeConst, fontWeightConst, iconSizeConst, colorMap};
export type {ColorKey};