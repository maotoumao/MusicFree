import getOrCreateMMKV from '@/utils/getOrCreateMMKV';
import safeParse from '@/utils/safeParse';
import {useState} from 'react';

// Internal Method
const getStore = () => {
    return getOrCreateMMKV(`App.PersistStatus`);
};

interface IPersistConfig {
    /** 当前的音乐 */
    'music.musicItem': IMusic.IMusicItem;
    /** 进度 */
    'music.progress': number;
    /** 模式 */
    'music.repeatMode': string;
    /** 列表 */
    'music.playList': IMusic.IMusicItem[];
    /** 速度 */
    'music.rate': number;
    /** 音质 */
    'music.quality': IMusic.IQualityKey;
    /** app */
    'app.skipVersion': string;
    /** 歌词-是否启用翻译 */
    'lyric.showTranslation': boolean;
}

function set<K extends keyof IPersistConfig>(
    key: K,
    value: IPersistConfig[K] | undefined,
) {
    const store = getStore();
    if (value === undefined) {
        store.delete(key);
    } else {
        store.set(key, JSON.stringify(value));
    }
}

function get<K extends keyof IPersistConfig>(key: K): IPersistConfig[K] | null {
    const store = getStore();
    const raw = store.getString(key);
    if (raw) {
        return safeParse(raw) as IPersistConfig[K];
    }
    return null;
}

function useStateImpl<K extends keyof IPersistConfig>(
    key: K,
    defaultValue?: IPersistConfig[K],
) {
    const [state, setState] = useState(get(key) ?? defaultValue);

    function _setState(newVal: IPersistConfig[K]) {
        setState(newVal);
        set(key, newVal);
    }

    return [state, _setState] as const;
}

const PersistStatus = {
    get,
    set,
    useLocalState: useStateImpl,
};

export default PersistStatus;
