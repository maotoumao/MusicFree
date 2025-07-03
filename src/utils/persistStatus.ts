/**
 * 全局持久化的状态
 */

import getOrCreateMMKV from "@/utils/getOrCreateMMKV";
import { useEffect, useState } from "react";
import { safeParse } from "./jsonUtil";

// Internal Method
const getStore = () => {
    return getOrCreateMMKV("App.PersistStatus");
};

interface IPersistStatus {
    /** 当前的音乐 */
    "music.musicItem": IMusic.IMusicItem;
    /** 进度 */
    "music.progress": number;
    /** 模式 */
    "music.repeatMode": string;
    /** 列表 */
    "music.playList": IMusic.IMusicItem[];
    /** 速度 */
    "music.rate": number;
    /** 音质 */
    "music.quality": IMusic.IQualityKey;
    /** app */
    "app.skipVersion": string;
    /** 开屏弹窗 */
    "app.skipBootstrapStorageDialog": boolean;
    /** 语言设置 */
    "app.language": string;
    /** 上次更新插件的时间 */
    "app.pluginUpdateTime": number;
    /** 缓存的定时关闭自定义时间（分钟） */
    "app.scheduleCloseTime": number;
    /** 歌词-是否启用翻译 */
    "lyric.showTranslation": boolean;
    /** 歌词-详情页字体大小 */
    "lyric.detailFontSize": number;
}

function set<K extends keyof IPersistStatus>(
    key: K,
    value: IPersistStatus[K] | undefined,
) {
    const store = getStore();
    if (value === undefined) {
        store.delete(key);
    } else {
        store.set(key, JSON.stringify(value));
    }
}

function get<K extends keyof IPersistStatus>(key: K): IPersistStatus[K] | null {
    const store = getStore();
    const raw = store.getString(key);
    if (raw) {
        return safeParse(raw) as IPersistStatus[K];
    }
    return null;
}

function useValue<K extends keyof IPersistStatus>(
    key: K,
    defaultValue?: IPersistStatus[K],
): IPersistStatus[K] | null {
    const [state, setState] = useState<IPersistStatus[K] | null>(
        get(key) ?? defaultValue ?? null,
    );

    useEffect(() => {
        const store = getStore();
        const sub = store.addOnValueChangedListener(changedKey => {
            if (key === changedKey) {
                setState(get(key));
            }
        });

        return () => {
            sub.remove();
        };
    }, []);

    return state;
}

const PersistStatus = {
    get,
    set,
    useValue,
};

export default PersistStatus;
