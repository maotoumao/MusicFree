import PluginManager from '@/core/pluginManager';
import minDistance from './minDistance';

/**
 *
 * @param musicItem 音乐类型
 * @param type 媒体类型
 * @param abortFunction 如果函数为true，则中断
 * @returns
 */
export default async function <T extends ICommon.SupportMediaType>(
    musicItem: IMusic.IMusicItem,
    type: T = 'music' as T,
    abortFunction?: () => boolean,
): Promise<ICommon.SupportMediaItemBase[T] | null> {
    const keyword = musicItem.alias || musicItem.title;
    const plugins = PluginManager.getSearchablePlugins(type);

    let distance = Infinity;
    let minDistanceMusicItem;
    let targetPlugin;

    const startTime = Date.now();

    for (let plugin of plugins) {
        // 超时时间：8s
        if (abortFunction?.() || Date.now() - startTime > 8000) {
            break;
        }
        if (plugin.name === musicItem.platform) {
            continue;
        }
        const results = await plugin.methods
            .search(keyword, 1, type)
            .catch(() => null);

        // 取前两个
        const firstTwo = results?.data?.slice(0, 2) || [];

        for (let item of firstTwo) {
            if (item.title === keyword && item.artist === musicItem.artist) {
                distance = 0;
                minDistanceMusicItem = item;
                targetPlugin = plugin;
                break;
            } else {
                const dist =
                    minDistance(keyword, musicItem.title) +
                    minDistance(item.artist, musicItem.artist);
                if (dist < distance) {
                    distance = dist;
                    minDistanceMusicItem = item;
                    targetPlugin = plugin;
                }
            }
        }

        if (distance === 0) {
            break;
        }
    }
    if (minDistanceMusicItem && targetPlugin) {
        return minDistanceMusicItem as ICommon.SupportMediaItemBase[T];
    }

    return null;
}
