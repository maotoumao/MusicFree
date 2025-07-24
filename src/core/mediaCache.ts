import { addFileScheme } from "@/utils/fileUtils";
import getOrCreateMMKV from "@/utils/getOrCreateMMKV";
import { safeParse } from "@/utils/jsonUtil";
import { getMediaUniqueKey } from "@/utils/mediaUtils";
import { exists, unlink } from "react-native-fs";

// Internal Method
const mediaCacheStore = getOrCreateMMKV("cache.MediaCache", true);

// 最多缓存800条数据
const maxCacheCount = 800;

/** 获取meta信息 */
const getMediaCache = (mediaItem: ICommon.IMediaBase) => {
    if (mediaItem.platform && mediaItem.id) {
        const cacheMediaItem = mediaCacheStore.getString(
            getMediaUniqueKey(mediaItem),
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
                const rawCacheMedia = mediaCacheStore.getString(allKeys[i]);
                const cacheData = rawCacheMedia
                    ? safeParse(rawCacheMedia)
                    : null;
                clearLocalCaches(cacheData);

                mediaCacheStore.delete(allKeys[i]);
            }
        }

        mediaCacheStore.set(getMediaUniqueKey(mediaItem), JSON.stringify(mediaItem));
        return true;
    }

    return false;
};

async function clearLocalCaches(cacheData: IMusic.IMusicItemCache) {
    if (cacheData.$localLyric) {
        await checkPathAndRemove(cacheData.$localLyric.rawLrc);
        await checkPathAndRemove(cacheData.$localLyric.translation);
    }
}

async function checkPathAndRemove(filePath?: string) {
    if (!filePath) {
        return;
    }
    filePath = addFileScheme(filePath);
    if (await exists(filePath)) {
        unlink(filePath);
    }
}

/** 移除缓存信息 */
const removeMediaCache = (mediaItem: ICommon.IMediaBase) => {
    if (mediaItem.platform && mediaItem.id) {
        mediaCacheStore.delete(getMediaUniqueKey(mediaItem));
    }

    return false;
};

const MediaCache = {
    getMediaCache,
    setMediaCache,
    removeMediaCache,
};

export default MediaCache;
