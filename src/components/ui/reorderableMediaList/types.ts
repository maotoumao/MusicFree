import { type ReactElement } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';

/**
 * ReorderableMediaList 契约（子任务 0 定稿）—— Skia 自绘的虚拟化拖拽重排媒体列表
 * 纯 UI：调用方经 getItemContent 把业务对象投影成纯展示数据；组件不解析业务对象、不收任意 renderItem
 * 固定行高 64、无封面（歌曲行两行内容）
 */

/** 调用方把每项投影成的纯展示数据（禁把整个业务对象传入 UI） */
export interface MediaRowContent {
    /** 主标题（歌名 / 歌单名），单行省略号 */
    title: string;
    /** 副标题（如「歌手 - 专辑」/「歌手 · N 首」），单行省略号 */
    subtitle?: string;
    /** 来源标签文案（表现语义，非插件 wire 字段 platform） */
    sourceLabel?: string;
}

/** 落定重排事件：带稳定 key（非仅可能过期的 index） */
export interface ReorderEvent {
    key: string;
    from: number;
    to: number;
}

export interface ReorderableMediaListProps<T> {
    data: readonly T[];
    /** 稳定唯一 key */
    keyExtractor: (item: T) => string;
    /** 业务对象 → 纯展示数据的投影 */
    getItemContent: (item: T) => MediaRowContent;
    /** 显示序号（无封面时的 leading）；序号 = 行的视觉位置，由列表派生、非投影提供 */
    showPosition?: boolean;
    /** 落定且位置变化时触发 */
    onReorder: (event: ReorderEvent) => void;
    /** 拿起某行时（触觉反馈等由消费方接 infra） */
    onDragStart?: (key: string) => void;
    /** 松手时 */
    onDragEnd?: () => void;
    /** 关闭拖拽（退化为普通列表） */
    dragEnabled?: boolean;
    /**
     * 可选模式：画左侧 checkbox + 整行短按切换选中
     * 与 showPosition 互斥（编辑态父应设 showPosition=false）；可与拖拽把手并存
     */
    selectable?: boolean;
    /**
     * 受控选中集（父持权威快照）；仅 selectable 生效
     * 应只含当前 data 中的 key——切换数据源时父需同步清空或替换（否则全选判定可能误判）
     */
    selectedKeys?: ReadonlySet<string>;
    /** 短按某行切换选中 */
    onToggleSelect?: (key: string) => void;
    /** 空态（列表外层逃生口；不开放任意行节点） */
    ListEmptyComponent?: ReactElement | null;
    style?: StyleProp<ViewStyle>;
}
