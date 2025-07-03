/**
 * 媒体资源的附加属性
 */
import getOrCreateMMKV from "@/utils/getOrCreateMMKV";
import { getMediaUniqueKey } from "@/utils/mediaUtils";
import { useEffect, useState } from "react";
import { safeParse } from "./jsonUtil";

// Internal Method
const getPluginStore = (pluginName: string) => {
    return getOrCreateMMKV(`MediaExtra.${pluginName}`);
};

/** 音乐的附加属性 */
interface IMediaExtraProperties {
    /** 是否已下载 */
    downloaded?: boolean;
    /** 本地路径 */
    localPath?: string;
    /** 歌词偏移 */
    lyricOffset?: number;
    /** 关联歌词 */
    associatedLrc?: ICommon.IMediaBase
}


const observerCallbacks = new Map<string, Set<(extra: IMediaExtraProperties | null) => void>>();

/**
 * 获取媒体资源的全部附加属性
 * @param mediaItem 媒体资源
 * @returns 
 */
function getMediaExtra(mediaItem: ICommon.IMediaBase | null): IMediaExtraProperties | null {
    if (!mediaItem?.platform || !mediaItem.id) {
        return null;
    }

    const meta = getPluginStore(mediaItem.platform).getString(
        `${mediaItem.id}`,
    );
    if (!meta) {
        return null;
    }
    const parsedMeta = safeParse<IMediaExtraProperties>(meta);
    return parsedMeta;
}


/**
 * 获取媒体资源的附加属性值
 * @param mediaItem 
 * @param key 
 * @returns 
 */
function getMediaExtraProperty<K extends keyof IMediaExtraProperties>(mediaItem: ICommon.IMediaBase | null, key: K): IMediaExtraProperties[K] | null {
    const meta = getMediaExtra(mediaItem);
    return meta ? meta[key] : null;
}

/**
 * 更新媒体资源的附加属性
 * @param mediaItem 媒体资源
 * @param extra 附加属性
 * @returns 
 */
function patchMediaExtra(mediaItem: ICommon.IMediaBase, extra: Partial<IMediaExtraProperties>) {
    if (!mediaItem.platform || !mediaItem.id) {
        return null;
    }

    const originalMeta = getMediaExtra(mediaItem);
    const store = getPluginStore(mediaItem.platform);
    const newMeta = {
        ...originalMeta,
        ...extra,
    };
    store.set(`${mediaItem.id}`, JSON.stringify(newMeta));

    // 发送事件更新
    const callbacks = observerCallbacks.get(getMediaUniqueKey(mediaItem));
    if (callbacks && callbacks.size > 0) {
        for (const callback of callbacks) {
            callback(newMeta);
        }
    }

    return newMeta;
}

/**
 * 直接替换媒体资源的附加属性
 * @param mediaItem 媒体资源
 * @param extra 附加属性
 * @returns 
 */
function setMediaExtra(mediaItem: ICommon.IMediaBase, extra: IMediaExtraProperties) {
    if (!mediaItem.platform || !mediaItem.id) {
        return null;
    }
    const store = getPluginStore(mediaItem.platform);
    store.set(`${mediaItem.id}`, JSON.stringify(extra));

    // 发送事件更新
    const callbacks = observerCallbacks.get(getMediaUniqueKey(mediaItem));
    if (callbacks && callbacks.size > 0) {
        for (const callback of callbacks) {
            callback(extra);
        }
    }

    return extra;
}

/**
 * 删除媒体资源的附加属性
 * @param mediaItem 媒体资源
 * @returns 
 */
function removeMediaExtra(mediaItem: ICommon.IMediaBase) {
    if (!mediaItem.platform || !mediaItem.id) {
        return false;
    }
    const store = getPluginStore(mediaItem.platform);
    store.delete(`${mediaItem.id}`);

    // 发送事件更新
    const callbacks = observerCallbacks.get(getMediaUniqueKey(mediaItem));
    if (callbacks && callbacks.size > 0) {
        for (const callback of callbacks) {
            callback(null);
        }
    }

    return true;
}

/**
 * 删除所有媒体资源的附加属性
 * @param pluginName 插件名称
 */
function removeAllMediaExtra(pluginName: string) {
    const store = getPluginStore(pluginName);
    store.clearAll();

    // 寻找所有pluginName开头的key
    const keys = observerCallbacks.keys();
    for (const key of keys) {
        if (key.startsWith(pluginName + "@")) {
            const callbacks = observerCallbacks.get(key);

            if (callbacks && callbacks.size > 0) {
                for (const callback of callbacks) {
                    callback(null);
                }
            }
        }
    }
}


function useMediaExtra(mediaItem: ICommon.IMediaBase) {
    const [mediaExtraState, setMediaExtraState] = useState<IMediaExtraProperties | null>(getMediaExtra(mediaItem));

    useEffect(() => {
        const callback = (mediaExtra: IMediaExtraProperties | null) => {
            setMediaExtraState(mediaExtra);
        };


        if (!mediaItem) {
            setMediaExtraState(null);
        } else {
            setMediaExtraState(getMediaExtra(mediaItem));

            const mediaKey = getMediaUniqueKey(mediaItem);
            if (!observerCallbacks.has(mediaKey)) {
                observerCallbacks.set(mediaKey, new Set());
            }
            const callbacks = observerCallbacks.get(mediaKey);
            if (callbacks) {
                callbacks.add(callback);
            }
        }


        return () => {
            const mediaKey = getMediaUniqueKey(mediaItem);
            if (observerCallbacks.has(mediaKey)) {
                const callbacks = observerCallbacks.get(mediaKey);
                if (callbacks) {
                    callbacks.delete(callback);
                    if (callbacks.size === 0) {
                        observerCallbacks.delete(mediaKey);
                    }
                }

            }
        };
    }, [mediaItem]);

    return mediaExtraState;
}


function useMediaExtraProperty<K extends keyof IMediaExtraProperties>(mediaItem: ICommon.IMediaBase, key: K) {
    const [mediaExtraPropertyState, setMediaExtraPropertyState] = useState<IMediaExtraProperties[K] | null>(getMediaExtraProperty(mediaItem, key));

    useEffect(() => {
        const callback = (mediaExtra: IMediaExtraProperties | null) => {
            setMediaExtraPropertyState(mediaExtra ? mediaExtra[key] : null);
        };

        if (!mediaItem) {
            setMediaExtraPropertyState(null);
        } else {
            setMediaExtraPropertyState(getMediaExtraProperty(mediaItem, key));

            const mediaKey = getMediaUniqueKey(mediaItem);
            if (!observerCallbacks.has(mediaKey)) {
                observerCallbacks.set(mediaKey, new Set());
            }
            const callbacks = observerCallbacks.get(mediaKey);
            if (callbacks) {
                callbacks.add(callback);
            }
        }


        return () => {
            const mediaKey = getMediaUniqueKey(mediaItem);
            if (observerCallbacks.has(mediaKey)) {
                const callbacks = observerCallbacks.get(mediaKey);
                if (callbacks) {
                    callbacks.delete(callback);
                    if (callbacks.size === 0) {
                        observerCallbacks.delete(mediaKey);
                    }
                }
            }
        };
    }, [mediaItem]);

    return mediaExtraPropertyState;
}


export {
    getMediaExtra,
    getMediaExtraProperty,
    patchMediaExtra,
    setMediaExtra,
    removeMediaExtra,
    removeAllMediaExtra,
    useMediaExtra,
    useMediaExtraProperty,
};