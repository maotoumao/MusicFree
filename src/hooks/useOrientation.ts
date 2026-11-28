import { useWindowDimensions } from 'react-native';

export type Orientation = 'portrait' | 'landscape';

/** 当前朝向（反应式：随旋转 / 折叠屏展开 / 分屏的窗口尺寸变化更新） */
export function useOrientation(): Orientation {
    const { width, height } = useWindowDimensions();
    return width >= height ? 'landscape' : 'portrait';
}
