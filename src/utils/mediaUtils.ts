import {
    internalSerializeKey,
    localPluginPlatform,
} from "@/constants/commonConst";
import { getMediaExtraProperty } from "./mediaExtra";

/**
 * 获取媒体资源的唯一key
 * @param mediaItem 
 * @returns 
 */
export function getMediaUniqueKey(mediaItem: ICommon.IMediaBase) {
    return `${mediaItem.platform}@${mediaItem.id}`;
}

/**
 * 解析媒体资源的唯一key
 * @param key 
 * @returns 
 */
export function parseMediaUniqueKey(key: string): ICommon.IMediaBase {
    try {
        const str = JSON.parse(key.trim());
        let platform, id;
        if (typeof str === "string") {
            [platform, id] = str.split("@");
        } else {
            platform = str?.platform;
            id = str?.id;
        }
        if (!platform || !id) {
            throw new Error("mediakey不完整");
        }
        return {
            platform,
            id,
        };
    } catch (e: any) {
        throw e;
    }
}

/**
 * 比较两个媒体资源是否相同
 * @param a 
 * @param b 
 * @returns 
 */
export function isSameMediaItem(
    a: ICommon.IMediaBase | null | undefined,
    b: ICommon.IMediaBase | null | undefined,
) {
    // eslint-disable-next-line eqeqeq
    return !!(a && b && a.id == b.id && a.platform === b.platform);
}


/** 获取复位的mediaItem */
export function resetMediaItem<T extends ICommon.IMediaBase>(
    mediaItem: T,
    platform?: string,
    newObj?: boolean,
): T {
    // 本地音乐不做处理
    if (
        mediaItem.platform === localPluginPlatform ||
        platform === localPluginPlatform
    ) {
        return newObj ? { ...mediaItem } : mediaItem;
    }
    if (!newObj) {
        mediaItem.platform = platform ?? mediaItem.platform;
        mediaItem[internalSerializeKey] = undefined;
        return mediaItem;
    } else {
        return {
            ...mediaItem,
            platform: platform ?? mediaItem.platform,
            [internalSerializeKey]: undefined,
        };
    }
}

/**
 * 获取媒体资源的本地路径，如果本地路径不存在，则返回null
 * @param mediaItem 
 * @returns 
 */
export function getLocalPath(mediaItem: ICommon.IMediaBase) {
    if (!mediaItem) {
        return null;
    }

    // 如果本身就是一个内部音乐
    if (mediaItem.url && (mediaItem.url.startsWith("file://") || mediaItem.url.startsWith("content://"))) {
        return mediaItem.url;
    }

    // 尝试从内部数据中获取 -- legacy logic
    const legacyLocalPath = mediaItem?.[internalSerializeKey]?.localPath;
    if (legacyLocalPath && typeof legacyLocalPath === "string") {
        return legacyLocalPath;
    }

    // 从附加信息中获取
    const localPathInMediaExtra = getMediaExtraProperty(mediaItem, "localPath");

    return localPathInMediaExtra ?? null;
}