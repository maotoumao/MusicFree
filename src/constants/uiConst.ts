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
};

const fontWeightConst: Record<
  'regular' | 'bold' | 'bolder',
  '400' | '600' | '800'
> = {
  regular: '400',
  bold: '600',
  bolder: '800',
};

export {fontSizeConst, fontWeightConst};
