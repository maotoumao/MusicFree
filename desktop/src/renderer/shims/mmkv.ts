/**
 * react-native-mmkv 桌面实现
 * 内存 Map + 主进程 JSON 文件持久化(sendSync 加载 / 防抖异步保存)。
 * 仅实现应用实际使用的字符串子集与 hooks。
 */
import { useCallback, useEffect, useState } from "react";

declare global {
    interface Window {
        __MUSICFREE_DESKTOP__?: any;
    }
}

const bridge = window.__MUSICFREE_DESKTOP__;

export interface MMKVConfiguration {
    id?: string;
    path?: string;
    encryptionKey?: string;
}

type ChangeListener = (key: string) => void;

export class MMKV {
    private storeId: string;
    private dir: string;
    private data: Map<string, string>;
    private saveTimer: number | null = null;
    private listeners = new Set<ChangeListener>();

    constructor(configuration: MMKVConfiguration = {}) {
        this.storeId = configuration.id ?? "default";
        this.dir = configuration.path ?? "default";
        let initial: Record<string, string> = {};
        try {
            initial = bridge?.mmkv?.load(this.storeId, this.dir) ?? {};
        } catch (e) {
            console.warn("[mmkv] load failed:", this.storeId, e);
        }
        this.data = new Map(Object.entries(initial));
    }

    private notify(key: string) {
        this.listeners.forEach((fn) => {
            try {
                fn(key);
            } catch (e) {
                console.error("[mmkv] listener error", e);
            }
        });
        this.scheduleSave();
    }

    private scheduleSave() {
        if (this.saveTimer !== null) {
            window.clearTimeout(this.saveTimer);
        }
        this.saveTimer = window.setTimeout(() => {
            this.saveTimer = null;
            try {
                bridge?.mmkv?.save?.(
                    this.storeId,
                    this.dir,
                    Object.fromEntries(this.data),
                );
            } catch (e) {
                console.warn("[mmkv] save failed:", this.storeId, e);
            }
        }, 300);
    }

    /** 立即落盘(应用退出前调用) */
    flushSync() {
        if (this.saveTimer !== null) {
            window.clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
        try {
            bridge?.mmkv?.save?.(
                this.storeId,
                this.dir,
                Object.fromEntries(this.data),
            );
        } catch {
            // ignore
        }
    }

    set(key: string, value: string | number | boolean | Uint8Array): void {
        const stored =
            typeof value === "string"
                ? value
                : typeof value === "number" || typeof value === "boolean"
                    ? String(value)
                    : btoa(String.fromCharCode(...value));
        this.data.set(key, stored);
        this.notify(key);
    }

    getString(key: string): string | undefined {
        const v = this.data.get(key);
        return v === undefined ? undefined : v;
    }

    getNumber(key: string): number | undefined {
        const v = this.data.get(key);
        if (v === undefined) return undefined;
        const n = Number(v);
        return Number.isNaN(n) ? undefined : n;
    }

    getBoolean(key: string): boolean | undefined {
        const v = this.data.get(key);
        if (v === undefined) return undefined;
        return v === "true";
    }

    getBuffer(key: string): Uint8Array | undefined {
        const v = this.data.get(key);
        if (v === undefined) return undefined;
        try {
            const bin = atob(v);
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            return arr;
        } catch {
            return undefined;
        }
    }

    contains(key: string): boolean {
        return this.data.has(key);
    }

    delete(key: string): void {
        this.data.delete(key);
        this.notify(key);
    }

    clearAll(): void {
        this.data.clear();
        this.notify("*");
    }

    getAllKeys(): string[] {
        return Array.from(this.data.keys());
    }

    recrypt(_key: string): void {
        // 桌面端不支持加密
    }

    // ------------------------------------------------------------ 订阅
    addListener(fn: ChangeListener): () => void {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    toJSON(): Record<string, string> {
        return Object.fromEntries(this.data);
    }
}

// ------------------------------------------------------------ hooks
function useMMKVValue<T extends string | number | boolean>(
    key: string,
    store?: MMKV,
): [T | undefined, (value: T | undefined) => void] {
    const targetStore = store ?? defaultStore;
    const [value, setValue] = useState<T | undefined>(() => {
        try {
            return readValue(targetStore, key) as T | undefined;
        } catch {
            return undefined;
        }
    });

    useEffect(() => {
        const unsub = targetStore.addListener(() => {
            setValue(readValue(targetStore, key) as T | undefined);
        });
        // 挂载时刷新一次(键可能在别处被修改)
        setValue(readValue(targetStore, key) as T | undefined);
        return unsub;
    }, [key, targetStore]);

    const set = useCallback(
        (next: T | undefined) => {
            if (next === undefined || next === null) {
                targetStore.delete(key);
            } else {
                targetStore.set(key, next as any);
            }
        },
        [key, targetStore],
    );

    return [value, set];
}

function readValue(store: MMKV, key: string) {
    return store.getString(key);
}

export function useMMKVString(
    key: string,
    store?: MMKV,
): [string | undefined, (value: string | undefined) => void] {
    return useMMKVValue<string>(key, store);
}

export function useMMKVNumber(
    key: string,
    store?: MMKV,
): [number | undefined, (value: number | undefined) => void] {
    const [value, setValue] = useMMKVValue<string>(key, store);
    const numValue =
        value === undefined || value === "" ? undefined : Number(value);
    const setNum = useCallback(
        (n: number | undefined) => {
            setValue(n === undefined ? undefined : String(n));
        },
        [setValue],
    );
    return [
        numValue !== undefined && Number.isNaN(numValue) ? undefined : numValue,
        setNum,
    ];
}

export function useMMKVBoolean(
    key: string,
    store?: MMKV,
): [boolean | undefined, (value: boolean | undefined) => void] {
    const [value, setValue] = useMMKVValue<string>(key, store);
    const boolValue = value === undefined ? undefined : value === "true";
    const setBool = useCallback(
        (b: boolean | undefined) => {
            setValue(b === undefined ? undefined : String(b));
        },
        [setValue],
    );
    return [boolValue, setBool];
}

export function useMMKVObject<T>(
    key: string,
    store?: MMKV,
): [T | undefined, (value: T | undefined) => void] {
    const [value, setValue] = useMMKVValue<string>(key, store);

    const objValue: T | undefined = (() => {
        if (value === undefined || value === "") return undefined;
        try {
            return JSON.parse(value) as T;
        } catch {
            return undefined;
        }
    })();

    const setObj = useCallback(
        (obj: T | undefined) => {
            setValue(
                obj === undefined ? undefined : JSON.stringify(obj),
            );
        },
        [setValue],
    );

    return [objValue, setObj];
}

export function useMMKVInstance(configuration: MMKVConfiguration): MMKV {
    const [store] = useState(() => new MMKV(configuration));
    return store;
}

// 默认实例
const defaultStore = new MMKV({ id: "default" });

export const createMMKV = (configuration: MMKVConfiguration) =>
    new MMKV(configuration);

export function getAllMMKVInstanceIDs(): string[] {
    return ["default"];
}

export default { MMKV };
