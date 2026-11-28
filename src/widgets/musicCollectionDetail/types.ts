/**
 * MusicCollectionDetail 的注入契约
 * widget 消费 source（源特定数据 + 能力）；跨源一致的动作 widget 自持（import core）、不进契约
 */
import type { IconName } from '@/components/ui/icons.generated';
import type { MusicItem } from '@/types';
import type { MusicItemOptionsSource } from '@/widgets/overlays/MusicItemOptionsPanel';

/** 媒体语义类型；本轮只实现 'playlist'，'album' / 'topList' 为未来预留（与换肤正交） */
export type MusicCollectionKind = 'playlist' | 'album' | 'topList';

/** 头部展示数据（纯 UI，无播放 / 来源态） */
export interface CollectionHeader {
    /** 封面 url */
    artwork?: string;
    /** 缺图 / 加载失败的兑底图标（按集合类型：专辑 disc-3、歌手 user-round、歌单 list-music…） */
    fallbackIcon: IconName;
    title: string;
    /** 长文案 → 描述面板 */
    description?: string;
    /** 创建者；name 必填、头像可选；page adapter 可由插件 artist 文本映射 */
    creator?: { name: string; avatar?: string };
    /** 次行事实（创建于…）；曲数只由 PlayAllBar 表达，不在此重复 */
    details: readonly string[];
}

/** 首屏加载态；分页态另走 pagination */
export type CollectionListState = 'loading' | 'ready' | 'error';

/** 远程分页（仅远程有）：状态 + 加载命令内聚一处 */
export interface CollectionPagination {
    hasMore: boolean;
    isLoadingMore: boolean;
    hasLoadMoreError: boolean;
    loadMore(): void;
}

/** ⋮（overflow）菜单项；widget 映射为 ActionSheet 行 */
export interface CollectionMenuAction {
    label: string;
    icon?: IconName;
    /** 危险项（删除等）：图标 + 文案切 danger 色 */
    danger?: boolean;
    /** 前置条件未满足：置灰禁点（原因由只读 banner 等外部说明） */
    disabled?: boolean;
    onPress(): void;
}

/**
 * 收藏能力（仅远程歌单有：本地歌单是自己的、榜单与本地集合无此概念）
 * 缺省 → 不渲染收藏按钮；不设「置灰」态，不为不存在的能力占位
 */
export interface CollectionStarCapability {
    isStarred: boolean;
    /** 切换在途：原位 Spinner，占位不跳动 */
    isPending: boolean;
    onToggle(): void;
}

/** 排序选项（核心无关：source 提供 key + 展示文案，widget 不感知 core 排序枚举） */
export interface CollectionSortOption {
    key: string;
    label: string;
}

/** 排序能力（仅本地有）；缺省 → 播放条不渲染排序 */
export interface CollectionSortCapability {
    activeKey: string;
    options: readonly CollectionSortOption[];
    onSelect(key: string): void;
}

/** 源特定的数据与能力：由 page hook 从 core/playlist｜core/plugin 组装、注入 widget */
export interface MusicCollectionSource {
    /** 缺省 'playlist' */
    kind?: MusicCollectionKind;
    header: CollectionHeader;
    musicList: readonly MusicItem[];
    /** 首屏加载态 */
    listState: CollectionListState;
    /** 首屏失败重试（listState 为 'error' 时） */
    retryInitialLoad?(): void;
    /** listState 为 'error' 时展示的文案；缺省用通用「加载失败」（如本地歌单不存在、远程插件缺失） */
    errorMessage?: string;
    /** 仅远程分页 */
    pagination?: CollectionPagination;
    /** 收藏能力；缺省 → 不渲染收藏按钮 */
    star?: CollectionStarCapability;
    /** 仅本地 */
    sort?: CollectionSortCapability;
    /** ⋮ 内容（空 → 不渲染 ⋮） */
    overflowActions: readonly CollectionMenuAction[];
    /** 单曲「更多」面板的来源上下文（决定「从本集合移除该曲」等 source-specific 项） */
    itemOptionsSource: MusicItemOptionsSource;
    /** 当前集合的编辑（增删 / 排序 / 改信息）因 degraded 不可用的原因 */
    editDisabledReason?: string;
}

/** MusicCollectionDetail widget 的 props */
export interface MusicCollectionDetailProps {
    source: MusicCollectionSource;
}
