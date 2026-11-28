import { atom } from 'jotai';

/**
 * 每个推荐源当前选中的分类 tagId（会话内、不持久化）
 * 按 platform 存 → 切源各自保留选择；value = RecommendTag.id
 */
export const selectedRecommendTagIdsAtom = atom<ReadonlyMap<string, string>>(
    new Map(),
);
