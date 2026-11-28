import { useMMKVObject } from 'react-native-mmkv';

import { getObject, getOrCreateMMKV, setObject } from '@/infra/storage';

import {
    configDefaults,
    configRules,
    type ConfigKey,
    type ConfigSchema,
    type IConfig,
} from './types';

/** App 配置 MMKV store（id 是持久化契约，沿用 legacy，勿改） */
const configStore = getOrCreateMMKV('App.config');

/** 配置读写：MMKV 之上的类型化 KV（真相源即 MMKV，无 jotai 镜像） */
export class Config implements IConfig {
    get<K extends ConfigKey>(key: K): ConfigSchema[K] | undefined {
        return (
            getObject<ConfigSchema[K]>(configStore, key) ?? configDefaults[key]
        );
    }

    getStored<K extends ConfigKey>(key: K): ConfigSchema[K] | undefined {
        // 不回落默认：键存在 = 用户显式设过（备份口径用）
        return getObject<ConfigSchema[K]>(configStore, key);
    }

    set<K extends ConfigKey>(key: K, value?: ConfigSchema[K]): void {
        setObject(configStore, key, value);
    }

    isValid<K extends ConfigKey>(
        key: K,
        value: unknown,
    ): value is ConfigSchema[K] {
        return configRules[key](value);
    }

    subscribe(keys: readonly ConfigKey[], cb: () => void): () => void {
        const watched = new Set<string>(keys);
        const listener = configStore.addOnValueChangedListener(changedKey => {
            if (watched.has(changedKey)) {
                cb();
            }
        });
        return () => listener.remove();
    }
}

/** 裸对象 live-binding，UX / core 经此读写；由 app/container 装配 */
export let config: IConfig;

/** 仅 app/container 调：装配 config 单例 */
export function provideConfig(instance: IConfig): void {
    config = instance;
}

/** 响应式读配置：MMKV 变更（含原生/其他进程写）时重渲染；未设回中央默认 */
export function useConfig<K extends ConfigKey>(
    key: K,
): ConfigSchema[K] | undefined {
    return (
        useMMKVObject<ConfigSchema[K]>(key, configStore)[0] ??
        configDefaults[key]
    );
}

export type { IConfig, ConfigKey, ConfigSchema } from './types';
