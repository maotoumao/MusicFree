import {StorageKeys} from '@/constants/commonConst';
import {getMediaKey} from '@/utils/mediaItem';
import {getStorage, setStorage} from '@/utils/storage';
import LRUCache from 'lru-cache';
import {exists, unlink} from 'react-native-fs';

/** 缓存一些解析结果、临时的歌词文件等等
 * 触发缓存的时机：播放、部分特殊设置
 */
const localPathKey = [];
const cache = new LRUCache<string, ICommon.IMediaMeta>({
  max: 2000,
  maxSize: 5 * 1024 * 1024, //5MB
  sizeCalculation: (value, key) => {
    // todo: bytelength
    return (JSON.stringify(value, null, '')).length;
  },
  dispose: async (value, key) => {
    // todo: 如果meta中也用到了，就不删除了
    const valueObj = Object.values(value ?? {});
    for (let val of valueObj) {
      if (val?.startsWith('file:') && (await exists(val))) {
        unlink(val);
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

async function clearCache() {
  cache.clear();
  return setStorage(StorageKeys.MediaCache, undefined);
}

function updateCache(
  mediaItem: ICommon.IMediaBase,
  patch: ICommon.IMediaMeta,
) {
  const mediaKey = getMediaKey(mediaItem);
  const cacheData = cache.get(mediaKey) ?? {};
  cache.set(mediaKey, {
    ...cacheData,
    ...patch,
  });
  syncCache();
}

function syncCache() {
  setStorage(StorageKeys.MediaCache, cache.dump());
}

export function removeCache(mediaItem: ICommon.IMediaBase) {
  return cache.delete(getMediaKey(mediaItem));
}

const Cache = {
  setup: setupCache,
  get: getCache,
  clear: clearCache,
  update: updateCache,
};

export default Cache;
