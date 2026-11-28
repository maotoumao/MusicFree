import { layout } from '@/design';

import { useLayoutClass, type LayoutClass } from './useLayoutClass';

import type { ViewStyle } from 'react-native';

/**
 * 内容列的两档封顶：
 * - reading：正文 / 表单 / 设置行，layout.readingMaxWidth
 * - list：媒体行列表，layout.listMaxWidth
 */
export type ContentColumnKind = 'reading' | 'list';

export interface ContentColumnOptions {
    /**
     * 谁负责内容线（横向内距）：
     * - children（默认）：行 / 字段自己带 screenGutter(16) 内距——本列只补「平板档 − 手机档」的差额，让内容线落到 32
     * - self：列内元素不带横向内距——本列直接给平板档内距 32
     */
    gutter?: 'children' | 'self';
}

/** 封顶宽按类别取 token */
export function contentMaxWidthFor(kind: ContentColumnKind): number {
    return kind === 'reading' ? layout.readingMaxWidth : layout.listMaxWidth;
}

/**
 * 纯计算：给「已有的」内容容器一份限宽居中样式
 *
 * **手机恒返回 undefined**——挂到 style 数组里等于什么都没加，渲染树与今天一致。
 * 平板两档（竖 / 横）同一套值：列宽 = 封顶 + 2×gutter.tablet，内容线 32。
 */
export function contentColumnStyleFor(
    kind: ContentColumnKind,
    layoutClass: LayoutClass,
    options?: ContentColumnOptions,
): ViewStyle | undefined {
    if (layoutClass === 'phone') {
        return undefined;
    }
    const tabletGutter = layout.gutter.tablet;
    const paddingHorizontal =
        (options?.gutter ?? 'children') === 'self'
            ? tabletGutter
            : tabletGutter - layout.gutter.compact;
    return {
        width: '100%',
        maxWidth: contentMaxWidthFor(kind) + tabletGutter * 2,
        alignSelf: 'center',
        paddingHorizontal,
    };
}

/**
 * 平板内容线相对手机多出来的那一段横向内距（纯计算）：给「不限宽、只对齐内容线」的
 * 满幅元素用——网格页的行、横向 chip 条、源 Tab 条……它们自带 screenGutter(16)，
 * 平板再补 16 落到 32。手机恒 undefined
 */
export function gutterExtraFor(
    layoutClass: LayoutClass,
): ViewStyle | undefined {
    if (layoutClass === 'phone') {
        return undefined;
    }
    return { paddingHorizontal: layout.gutter.tablet - layout.gutter.compact };
}

/** 平板补内距（反应式）：挂到自带 16 内距的满幅容器 / contentContainerStyle 上 */
export function useGutterExtra(): ViewStyle | undefined {
    return gutterExtraFor(useLayoutClass());
}

/**
 * 平板内容线本身（纯计算）：给「自己就是内容线持有者」的节点用——它的 paddingHorizontal
 * 静态写着 screenGutter(16)，平板直接替换成 32（同名 key 后者覆盖）。手机恒 undefined
 */
export function contentGutterFor(
    layoutClass: LayoutClass,
): ViewStyle | undefined {
    if (layoutClass === 'phone') {
        return undefined;
    }
    return { paddingHorizontal: layout.gutter.tablet };
}

/** 平板内容线（反应式）：`[styles.body, gutter]` 覆盖节点自带的 paddingHorizontal */
export function useContentGutter(): ViewStyle | undefined {
    return contentGutterFor(useLayoutClass());
}

/**
 * 内容列样式（反应式）：直接铺进页面已有容器的 style 数组
 *
 * @example
 * const column = useContentColumn('reading');
 * <ScrollView contentContainerStyle={[styles.content, column]} />
 */
export function useContentColumn(
    kind: ContentColumnKind,
    options?: ContentColumnOptions,
): ViewStyle | undefined {
    const layoutClass = useLayoutClass();
    return contentColumnStyleFor(kind, layoutClass, options);
}
