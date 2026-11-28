import { useSyncExternalStore } from 'react';
import { Dimensions } from 'react-native';

import { breakpoints } from '@/design';

/**
 * 矮窗判据：窗口高 < breakpoints.compactHeight
 *
 * 与 useLayoutClass 的 LayoutClass **正交**，故单独成一问、也单独成一文件：
 * 尺寸类回答「有多宽、能不能分栏」，本判据回答「有多高、chrome 还付得起吗」。
 * 手机横屏 780 × 360 两问答案相反——宽比平板竖屏还富裕，高却只有竖屏一半——
 * 合并成一个枚举就必然要在某一问上说谎。
 *
 * 与朝向也正交：判的是高度本身，故竖向的矮窗（如分屏上半屏 360 × 400）同样吃矮档，
 * 这是有意的——付不起 chrome 的是矮，不是横。
 *
 * 消费方只有两类，别扩散：
 * - chrome 换矮档（AppBar / MusicBar 行高、AppUpdateDialog 的紧凑排布）
 * - 内容列取消限宽（见 ui/mediaListLayout 与 pages/home/lib/entryGrid 里各自的理由）
 */
export function isCompactHeight(height: number): boolean {
    return height < breakpoints.compactHeight;
}

function subscribe(onChange: () => void) {
    const subscription = Dimensions.addEventListener('change', onChange);
    return () => subscription.remove();
}

function getSnapshot(): boolean {
    return isCompactHeight(Dimensions.get('window').height);
}

/**
 * 当前是否矮窗（反应式：随旋转 / 折叠展开 / 分屏变化）
 *
 * 同 useLayoutClass 走 useSyncExternalStore：快照是布尔，分屏拖分割线时高度连续变、
 * 跨不过阈值就**不重渲**
 */
export function useCompactHeight(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
