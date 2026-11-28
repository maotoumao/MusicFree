import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { borderWidth, layout, useColors } from '@/design';
import { contentMaxWidthFor } from '@/hooks/useContentColumn';
import { useLayoutClass } from '@/hooks/useLayoutClass';

import type { ContentColumnKind } from '@/hooks/useContentColumn';

interface PaperPaneProps {
    /** 纸的宽度档：与页面内容列同一档（reading 680 / list 840），纸宽 = 封顶 + 2×gutter.tablet */
    width: ContentColumnKind;
    /** 只在真的渲染出纸时生效（横屏平板）；手机 / 竖屏平板不渲染任何容器 */
    style?: StyleProp<ViewStyle>;
    children: ReactNode;
}

/**
 * 横屏单栏页的「纸」：内容列铺 surface、两侧 hairline，纸外露出 background / 壁纸
 *
 * 原则四：对称留白在纯色底上读作「没做完」，给它一张纸，留白就变成桌面。
 * 只有一栏可放的页面（媒体行列表 / 表单 / 多选）用它；分栏页与网格页不用。
 *
 * 仅 tabletLandscape 渲染容器；其余尺寸类**原样返回 children**——手机渲染树与今天一致。
 * 代价：类别切换（旋转 / 折叠）时子树重挂，列表丢滚动位；播放进度 / 选区在 core，不受影响。
 */
export function PaperPane({ width, style, children }: PaperPaneProps) {
    const layoutClass = useLayoutClass();
    const colors = useColors();
    if (layoutClass !== 'tabletLandscape') {
        return children;
    }
    return (
        <View
            style={[
                styles.pane,
                {
                    maxWidth:
                        contentMaxWidthFor(width) + layout.gutter.tablet * 2,
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                },
                style,
            ]}
        >
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    pane: {
        flex: 1,
        width: '100%',
        alignSelf: 'center',
        borderLeftWidth: borderWidth.hairline,
        borderRightWidth: borderWidth.hairline,
        overflow: 'hidden',
    },
});
