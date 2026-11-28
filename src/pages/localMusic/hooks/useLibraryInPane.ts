import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { libraryLayoutFor } from '../lib/layout';

/**
 * 当前是不是横屏分栏形态
 *
 * 给「行限宽」用：分栏下行已被定宽栏约束，`MediaList` 不该再按窗口宽套手机档的 640
 * （内容线两条分支一样，`inPane` 只改封顶宽）。
 * 「全部」视图自己读这个判据（它独占右区、还要拿它对齐工具条），
 * 三个集合视图由容器按 `availableWidth` 是否给出来传 `inPane`
 */
export function useLibraryInPane(): boolean {
    const { width, height } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    // 只喂左右安全区之和：镜像对称保证朝向翻转时和不变（见 lib/layout 的说明）
    return (
        libraryLayoutFor(width, height, insets.left + insets.right).form ===
        'panes'
    );
}
