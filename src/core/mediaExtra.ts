import getOrCreateMMKV from '@/utils/getOrCreateMMKV';
import safeParse from '@/utils/safeParse';

// Internal Method
const getPluginStore = (pluginName: string) => {
    return getOrCreateMMKV(`MediaExtra.${pluginName}`);
};

/** 获取meta信息 */
const get = (mediaItem: ICommon.IMediaBase) => {
    if (mediaItem.platform && mediaItem.id) {
        const meta = getPluginStore(mediaItem.platform).getString(
            `${mediaItem.id}`,
        );
        if (!meta) {
            return null;
        }

        return safeParse<ICommon.IMediaMeta>(meta);
    }

    return null;
};

/** 设置meta信息 */
const set = (mediaItem: ICommon.IMediaBase, meta: ICommon.IMediaMeta) => {
    if (mediaItem.platform && mediaItem.id) {
        const store = getPluginStore(mediaItem.platform);
        store.set(mediaItem.id, JSON.stringify(meta));
        return true;
    }

    return false;
};

/** 更新meta信息 */
const update = (
    mediaItem: ICommon.IMediaBase,
    meta: Partial<ICommon.IMediaMeta>,
) => {
    if (mediaItem.platform && mediaItem.id) {
        const store = getPluginStore(mediaItem.platform);
        const originalMeta = get(mediaItem);

        store.set(
            `${mediaItem.id}`,
            JSON.stringify({
                ...(originalMeta || {}),
                ...meta,
            }),
        );
        return true;
    }

    return false;
};

/** 删除meta信息 */
const remove = (mediaItem: ICommon.IMediaBase) => {
    if (mediaItem.platform && mediaItem.id) {
        const store = getPluginStore(mediaItem.platform);
        store.delete(`${mediaItem.id}`);
        return true;
    }

    return false;
};

const removeAll = (pluginName: string) => {
    const store = getPluginStore(pluginName);
    store.clearAll();
};

const MediaExtra = {
    get: get,
    set: set,
    update: update,
    remove: remove,
    removeAll: removeAll,
};

export default MediaExtra;
