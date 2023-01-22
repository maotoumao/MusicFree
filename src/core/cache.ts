import {internalSerializeKey, StorageKeys} from '@/constants/commonConst';
import {addFileScheme} from '@/utils/fileUtils';
import {trace} from '@/utils/log';
import {getMediaKey} from '@/utils/mediaItem';
import {getStorage, setStorage} from '@/utils/storage';
import produce from 'immer';
import LRUCache from 'lru-cache';
import objectPath from 'object-path';
import {exists, unlink} from 'react-native-fs';
import MediaMeta from './mediaMeta';
import PluginManager from './pluginManager';

/** 缓存一些解析结果、临时的歌词文件等等
 * 触发缓存的时机：播放、部分特殊设置
 */
// const localPathKey = [];
const cache = new LRUCache<string, ICommon.IMediaMeta>({
    max: 800,
    maxSize: 5 * 1024 * 1024, //5MB
    sizeCalculation: value => {
        // todo: bytelength
        return JSON.stringify(value, null, '').length;
    },
    dispose: async (value, key) => {
        // todo: 如果meta中也用到了，就不删除了
        // 全都放在internalkey/local中
        const localFiles = value?.[internalSerializeKey]?.local;
        if (localFiles) {
            const localMeta =
                MediaMeta.getByMediaKey(key)?.[internalSerializeKey]?.local;
            for (let [k, fp] of Object.entries(localFiles)) {
                if (!localMeta?.[k] && fp) {
                    trace('清理缓存', fp);
                    fp = addFileScheme(fp);
                    if (await exists(fp)) {
                        unlink(fp);
                    }
                }
            }
        }
        syncCache();
    },
    allowStale: false,
});

async function setupCache() {
    const cacheStorage = await getStorage(StorageKeys.MediaCache);
    if (cacheStorage && Array.isArray(cacheStorage)) {
        cache.load(cacheStorage);
    }
}

function getCache(
    mediaItem: ICommon.IMediaBase,
): ICommon.IMediaMeta | undefined {
    // sync
    const result = cache.get(getMediaKey(mediaItem));
    syncCache();
    return result;
}

function getCacheInternal(
    mediaItem: ICommon.IMediaBase,
): Record<string, any> | undefined {
    return getCache(mediaItem)?.[internalSerializeKey];
}

async function clearCache() {
    cache.clear();
    return setStorage(StorageKeys.MediaCache, undefined);
}

function updateCache(
    mediaItem: ICommon.IMediaBase,
    patch: ICommon.IMediaMeta | Array<[string, any]>,
) {
    const mediaKey = getMediaKey(mediaItem);
    let cacheData = cache.get(mediaKey);
    if (!cacheData || !patch) {
        // 自动写入主键
        const primaryKey = PluginManager.getByMedia(mediaItem)?.instance
            ?.primaryKey ?? ['id'];
        cacheData = {};
        for (let k of primaryKey) {
            cacheData[k] = mediaItem[k];
        }
    }
    if (Array.isArray(patch)) {
        cache.set(
            mediaKey,
            produce(cacheData, draft => {
                for (let [objPath, value] of patch) {
                    objectPath.set(draft, objPath, value);
                }
            }),
        );
    } else {
        cache.set(mediaKey, {
            ...cacheData,
            ...patch,
        });
    }
    if (__DEV__) {
        console.log('CACHE UPDATE, ', cache.dump());
    }
    syncCache();
}

function syncCache() {
    setStorage(StorageKeys.MediaCache, cache.dump());
}

function removeCache(mediaItem: ICommon.IMediaBase) {
    return cache.delete(getMediaKey(mediaItem));
}

const Cache = {
    setup: setupCache,
    get: getCache,
    getInternal: getCacheInternal,
    clear: clearCache,
    update: updateCache,
    remove: removeCache,
};

export default Cache;
