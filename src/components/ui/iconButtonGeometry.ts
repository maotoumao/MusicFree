import { iconSize, layout } from '@/design';

/**
 * IconButton 的纯几何：从组件文件里抽出来，让 AppBar 等容器（及其单测）
 * 只依赖算法、不拖进 reanimated / 图标表
 */

/** 命中壳内图标四周的留白（dp）：壳恒 44、图标居中，故留白随图标边长变 */
export const iconButtonShellPad = (size: keyof typeof iconSize) =>
    (layout.hitTarget - iconSize[size]) / 2;

/**
 * 贴边图标按钮的容器内边距（dp）：容器取此值，壳内图标本体才落在 contentLine 上
 * 用于「边缘子元素确定都是图标按钮」的容器（AppBar / 迷你播放条…）；泛型槽位改用 edgeAlign
 * size 缺省同 IconButton 的默认档；仅当 contentLine ≥ 壳内留白时成立，否则会得到负内边距
 */
export const iconButtonEdgeInset = (
    contentLine: number,
    size: keyof typeof iconSize = 'md',
) => contentLine - iconButtonShellPad(size);
