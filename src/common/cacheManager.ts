import {StorageKeys} from '@/constants/commonConst';
import {getStorage, setStorage} from '@/utils/storageUtil';
import LRUCache from 'lru-cache';
import { exists, unlink } from 'react-native-fs';

/** 缓存一些解析结果、临时文件等等 */
const cache = new LRUCache<string, ICommon.IMediaMeta>({
  max: 1500,
  maxSize: 5 * 1024 * 1024, //5MB
  sizeCalculation: (value, key) => {
    return Buffer.from(JSON.stringify(value, null, '')).byteLength;
  },
  dispose: async (value, key) => {
    const valueObj = Object.values(value ?? {});
    for(let val of valueObj) {
        if(val?.startsWith('file:') && await exists(val)) {
            unlink(val);
        }
    }
  },
  allowStale: false,
});

export async function setupCache() {
  const cacheStorage = await getStorage(StorageKeys.MediaCache);
  if (cacheStorage && Array.isArray(cacheStorage)) {
    cache.load(cacheStorage);
  }
}

export async function getCache(mediaItem: ICommon.IMediaBase): Promise<ICommon.IMediaMeta | undefined> {
    const {platform, id} = mediaItem;
    if(platform && id) {
        return cache.get(`${platform}@${id}`);
    }
}

export async function clearCache(){
    cache.clear();
    return setStorage(StorageKeys.MediaCache, undefined);
}

export async function setCache(mediaItem: ICommon.IMediaBase, patch: ICommon.IMediaMeta) {
    const {platform, id} = mediaItem;
    const cacheData = cache.get(`${platform}@${id}`);
    cache.set(`${platform}@${id}`, {
        ...cacheData,
        ...patch
    });
    setStorage(StorageKeys.MediaCache, cache.dump());
}
