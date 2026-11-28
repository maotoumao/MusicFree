import type { PluginMethodName } from '@/core/plugin';

/**
 * 推荐源资格：需完整「取分类标签 + 按分类取推荐歌单」流程的方法
 * 模块级常量、稳定引用，供 usePluginsWithMethods memo 化
 */
export const RECOMMEND_METHODS: readonly PluginMethodName[] = [
    'getRecommendPlaylistTags',
    'getRecommendPlaylistsByTag',
];
