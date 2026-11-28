import { useAtom } from 'jotai';
import { useCallback, useMemo } from 'react';

import { selectedRecommendTagIdsAtom } from '../store';

import type { RecommendPlaylistTagsResult, RecommendTag } from '@/types';

/**
 * 派生当前源的选中分类 + 选择器
 * allTags = pinned + 各组（按显示序、去重）；选中 = 已存 tagId（仍在集合内）否则默认首个
 * 纯派生：默认选中不写 store，只有用户 selectTag 才落库（会话内、per-source）
 */
export function useSelectedRecommendTag(
    platform: string,
    tags: RecommendPlaylistTagsResult | undefined,
) {
    const [idMap, setIdMap] = useAtom(selectedRecommendTagIdsAtom);

    // pinned 去重（按 id）；CategoryBar / Panel / 选择派生共用同一份，避免可见 Chip 与选择模型不一致
    const pinnedTags = useMemo(() => {
        const seen = new Set<string>();
        const out: RecommendTag[] = [];
        for (const tag of tags?.pinned ?? []) {
            if (!seen.has(tag.id)) {
                seen.add(tag.id);
                out.push(tag);
            }
        }
        return out;
    }, [tags]);

    // 全部可选 = pinned + 各组（跨 pinned/组去重、按显示序）；供默认选中与失效校验
    const allTags = useMemo(() => {
        const seen = new Set(pinnedTags.map(tag => tag.id));
        const out = [...pinnedTags];
        for (const group of tags?.data ?? []) {
            for (const tag of group.data) {
                if (!seen.has(tag.id)) {
                    seen.add(tag.id);
                    out.push(tag);
                }
            }
        }
        return out;
    }, [pinnedTags, tags]);

    const storedId = idMap.get(platform);
    // 已存选择仍在集合内则用之，否则回退默认首个（标签刷新后失效的选择自动纠正）
    const selectedTag = useMemo(
        () => allTags.find(tag => tag.id === storedId) ?? allTags[0],
        [allTags, storedId],
    );

    const selectTag = useCallback(
        (tag: RecommendTag) => {
            setIdMap(prev => new Map(prev).set(platform, tag.id));
        },
        [platform, setIdMap],
    );

    return { pinnedTags, selectedTag, selectTag };
}
