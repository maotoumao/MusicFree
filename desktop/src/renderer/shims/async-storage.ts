/**
 * @react-native-async-storage/async-storage 桌面端实现
 * 数据落到 localStorage(Electron userData 目录持久化)。
 * 仅在旧数据迁移(migrate.ts)时使用,接口按需实现。
 */

const PREFIX = "__MUSICFREE_ASYNC_STORAGE__";

function getKey(key: string): string {
    return `${PREFIX}${key}`;
}

const AsyncStorage = {
    async getItem(key: string): Promise<string | null> {
        return localStorage.getItem(getKey(key));
    },

    async setItem(key: string, value: string): Promise<void> {
        localStorage.setItem(getKey(key), String(value));
    },

    async removeItem(key: string): Promise<void> {
        localStorage.removeItem(getKey(key));
    },

    async mergeItem(key: string, value: string): Promise<void> {
        const existing = localStorage.getItem(getKey(key));
        if (!existing) {
            localStorage.setItem(getKey(key), value);
            return;
        }
        try {
            const merged = { ...JSON.parse(existing), ...JSON.parse(value) };
            localStorage.setItem(getKey(key), JSON.stringify(merged));
        } catch {
            localStorage.setItem(getKey(key), value);
        }
    },

    async clear(): Promise<void> {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k?.startsWith(PREFIX)) keys.push(k);
        }
        keys.forEach(k => localStorage.removeItem(k));
    },

    async getAllKeys(): Promise<string[]> {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k?.startsWith(PREFIX)) keys.push(k.slice(PREFIX.length));
        }
        return keys;
    },

    async multiGet(keys: string[]): Promise<[string, string | null][]> {
        return Promise.all(
            keys.map(async k => [k, await AsyncStorage.getItem(k)] as [string, string | null]),
        );
    },

    async multiSet(entries: [string, string][]): Promise<void> {
        for (const [k, v] of entries) {
            await AsyncStorage.setItem(k, v);
        }
    },

    async multiRemove(keys: string[]): Promise<void> {
        for (const k of keys) {
            await AsyncStorage.removeItem(k);
        }
    },
};

export default AsyncStorage;
