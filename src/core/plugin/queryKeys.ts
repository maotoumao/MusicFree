/**
 * 插件数据查询 key 约定：一律 ['plugin', platform, ...rest]
 * platform 位置确定（第二段）——变量变更按 ['plugin', platform] 前缀整体重置，不误伤把 platform 名当搜索词/tag 的其它源查询
 */
export function pluginQueryKey(
    platform: string | undefined,
    ...rest: unknown[]
): unknown[] {
    return ['plugin', platform, ...rest];
}
