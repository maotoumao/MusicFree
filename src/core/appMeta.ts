import getOrCreateMMKV from '@/utils/getOrCreateMMKV';

export function getAppMeta(key: string) {
    const metaMMKV = getOrCreateMMKV('App.meta');

    return metaMMKV.getString(key);
}

export function setAppMeta(key: string, value: any) {
    const metaMMKV = getOrCreateMMKV('App.meta');

    return metaMMKV.set(key, value);
}
