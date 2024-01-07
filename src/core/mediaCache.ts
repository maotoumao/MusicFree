import getOrCreateMMKV from '@/utils/getOrCreateMMKV';
import {getMediaKey} from '@/utils/mediaItem';
import safeParse from '@/utils/safeParse';

// Internal Method
const mediaCacheStore = getOrCreateMMKV('cache.MediaCache', true);

// 最多缓存1000条数据
const maxCacheCount = 800;

/** 获取meta信息 */
const getMediaCache = (mediaItem: ICommon.IMediaBase) => {
    if (mediaItem.platform && mediaItem.id) {
        const cacheMediaItem = mediaCacheStore.getString(
            getMediaKey(mediaItem),
        );
        return cacheMediaItem
            ? safeParse<ICommon.IMediaBase>(cacheMediaItem)
            : null;
    }

    return null;
};

/** 设置meta信息 */
const setMediaCache = (mediaItem: ICommon.IMediaBase) => {
    if (mediaItem.platform && mediaItem.id) {
        const allKeys = mediaCacheStore.getAllKeys();
        if (allKeys.length >= maxCacheCount) {
            // TODO: 随机删一半
            for (let i = 0; i < maxCacheCount / 2; ++i) {
                mediaCacheStore.delete(allKeys[i]);
            }
        }

        mediaCacheStore.set(getMediaKey(mediaItem), JSON.stringify(mediaItem));
        return true;
    }

    return false;
};

/** 移除缓存信息 */
const removeMediaCache = (mediaItem: ICommon.IMediaBase) => {
    if (mediaItem.platform && mediaItem.id) {
        mediaCacheStore.delete(getMediaKey(mediaItem));
    }

    return false;
};

const MediaCache = {
    getMediaCache,
    setMediaCache,
    removeMediaCache,
};

export default MediaCache;
