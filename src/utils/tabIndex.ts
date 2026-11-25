/**
 * 当 tab 数量减少（例如插件被卸载）时，把当前选中项收回到仍然存在的最后一个 tab。
 * 返回 null 表示不需要调整。
 */
export function clampTabIndex(index: number, routeCount: number): number | null {
    if (routeCount > 0 && index >= routeCount) {
        return routeCount - 1;
    }
    return null;
}
