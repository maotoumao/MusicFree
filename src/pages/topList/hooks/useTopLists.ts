import { useQuery } from '@tanstack/react-query';

import { pluginQueryKey } from '@/core/plugin';

import type { Plugin } from '@/core/plugin';
import type { PlaylistGroup } from '@/types';

/**
 * 单个插件源的榜单分组（getTopLists 单次拉取，无分页）
 * 按 platform + hash 缓存：TabView lazy 首次进源加载、切走保持挂载、切回显已加载数据（不重新挂载）
 * staleTime 0 标数据即时过期（有刷新触发点时才重取）；TODO 源 active 联动的后台刷新待 PluginSourcePager 暴露 active 态
 */
export function useTopLists(plugin: Plugin) {
    return useQuery<PlaylistGroup[]>({
        queryKey: pluginQueryKey(plugin.platform, 'topLists', plugin.hash),
        queryFn: () => plugin.methods.getTopLists(),
        staleTime: 0,
    });
}
