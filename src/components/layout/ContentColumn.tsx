import { type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import {
    useContentColumn,
    type ContentColumnKind,
    type ContentColumnOptions,
} from '@/hooks/useContentColumn';

interface ContentColumnProps extends ContentColumnOptions {
    kind: ContentColumnKind;
    /** 只在真的渲染出容器时生效（平板）；手机不渲染任何容器 */
    style?: StyleProp<ViewStyle>;
    children: ReactNode;
}

/**
 * 给「没有现成容器可挂样式」的一段内容套内容列：
 * 底栏里的按钮、列表 header、raw FlashList 的行……
 *
 * 平板：一层 View（限宽居中 + 平板内容线）；手机：**原样返回 children**，不多任何节点。
 * 有现成容器的地方直接用 useContentColumn 把样式挂上去，别多包这一层。
 */
export function ContentColumn({
    kind,
    gutter,
    style,
    children,
}: ContentColumnProps) {
    const column = useContentColumn(kind, { gutter });
    if (column === undefined) {
        return children;
    }
    return <View style={[column, style]}>{children}</View>;
}
