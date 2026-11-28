import type { PluginMethodName } from '@/core/plugin';

/**
 * 榜单源资格：需完整「列榜单 + 取榜单详情」流程的方法
 * 模块级常量、稳定引用，供 usePluginsWithMethods memo 化
 */
export const TOPLIST_METHODS: readonly PluginMethodName[] = [
    'getTopLists',
    'getTopListDetail',
];
