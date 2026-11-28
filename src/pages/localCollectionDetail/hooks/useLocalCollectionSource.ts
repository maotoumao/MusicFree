import { useCallback } from 'react';

import {
    localMusic,
    useCollectionMusic,
    useLocalSort,
} from '@/core/localMusic';
import { useT } from '@/i18n';
import { useLocalMusicCover } from '@/widgets/hooks/useLocalMusicCover';

import type { IconName } from '@/components/ui/icons.generated';
import type { LocalCollectionView, LocalSortBy } from '@/core/localMusic';
import type {
    CollectionSortOption,
    MusicCollectionSource,
} from '@/widgets/musicCollectionDetail/types';
import type { MusicItemOptionsSource } from '@/widgets/overlays/MusicItemOptionsPanel';

/** 本地集合单曲「更多」的来源上下文 = 本地库；决定是否显示「从库移除」（删除文件另由 item.platform 判定）；模块级常量保引用稳定 */
const LOCAL_ITEM_OPTIONS: MusicItemOptionsSource = { kind: 'localLibrary' };

/** 集合类型 → 详情头缺图兜底图标 */
const VIEW_FALLBACK_ICON: Record<LocalCollectionView, IconName> = {
    albums: 'disc-3',
    artists: 'user-round',
    folders: 'folder-open',
};

/** 排序字段展示顺序（与 core 解耦） */
const SORT_BYS: readonly LocalSortBy[] = [
    'title',
    'artist',
    'addedAt',
    'duration',
];

/** 字段 × 方向 → 一维选项标识（= i18n 叶子名，也是 CollectionSortCapability 要的一维 key） */
function sortOptionKey(by: LocalSortBy, desc: boolean) {
    return desc ? (`${by}Desc` as const) : by;
}

/**
 * 本地集合（文件夹/专辑/歌手）→ MusicCollectionSource，复用通用 MusicCollectionDetail
 * 内存派生恒 ready、无远程分页；本地集合无收藏（不提供 star）、不可手动增删
 * 排序走全局 localMusic.setSort，字段×方向摊平成一维选项
 * 详情头封面：查代表曲 ref → useLocalMusicCover 惰性 resolveCover（与概览封面同源、同缓存）
 */
export function useLocalCollectionSource(
    view: LocalCollectionView,
    collectionKey: string,
    title: string,
): MusicCollectionSource {
    const t = useT();
    const musicList = useCollectionMusic(view, collectionKey);
    const sort = useLocalSort();

    // 直接构造（不 useMemo）：useT 订阅 locale、切语言重渲即取新标签；仅 8 项、成本可忽略
    const sortOptions: readonly CollectionSortOption[] = SORT_BYS.flatMap(by =>
        [false, true].map(desc => ({
            key: sortOptionKey(by, desc),
            label: t(`media.sortOption.${sortOptionKey(by, desc)}`),
        })),
    );

    const onSelectSort = useCallback((key: string) => {
        const desc = key.endsWith('Desc');
        const by = (desc ? key.slice(0, -'Desc'.length) : key) as LocalSortBy;
        localMusic.setSort({ by, desc });
    }, []);

    // 详情头封面：查该集合代表曲 ref → 惰性 resolveCover（与概览封面同源、同缓存）
    const coverRef = localMusic.getCollectionCoverRef(view, collectionKey);
    const artwork = useLocalMusicCover(coverRef);

    const header = {
        artwork,
        fallbackIcon: VIEW_FALLBACK_ICON[view],
        title,
        // 曲数只由 PlayAllBar 表达，头部不重复
        details: [],
    };

    return {
        header,
        musicList,
        listState: 'ready',
        sort: {
            activeKey: sortOptionKey(sort.by, sort.desc),
            options: sortOptions,
            onSelect: onSelectSort,
        },
        overflowActions: [],
        itemOptionsSource: LOCAL_ITEM_OPTIONS,
    };
}
