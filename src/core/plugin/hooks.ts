/**
 * 插件反应式读取层（React hooks）：只读，写全走命令式 pluginManager
 * 内存态（pluginsAtom）→ useAtomValue；持久化态（MMKV）→ 按键订阅，不建 jotai 镜像
 */
import { useAtomValue } from 'jotai';
import { useMemo, useSyncExternalStore } from 'react';
import { useMMKVObject } from 'react-native-mmkv';

import { getObject } from '@/infra/storage';

import {
    DISABLED_KEY,
    keyOfAlternative,
    keyOfUserVariables,
    ORDER_KEY,
    pluginMetaStore,
} from './meta';
import { pluginsAtom } from './store';

import type { Plugin, PluginMethodName } from './types';
import type { MediaType } from '@/types';

/** 空变量兜底：冻结 + 稳定引用，避免每次 render 造新对象、也防下游误改污染共享空对象 */
const EMPTY_VARS: Readonly<Record<string, string>> = Object.freeze({});

/** 已装插件（有序：按用户 order 升序，未排序的新插件排末尾）；不含内建「本地」 */
export function usePlugins(): Plugin[] {
    const map = useAtomValue(pluginsAtom);
    const [order] = useMMKVObject<Record<string, number>>(
        ORDER_KEY,
        pluginMetaStore,
    );
    return useMemo(() => {
        const rank = (platform: string) =>
            order?.[platform] ?? Number.MAX_SAFE_INTEGER;
        return [...map.values()].sort(
            (a, b) => rank(a.platform) - rank(b.platform),
        );
    }, [map, order]);
}

/** 支持搜索的已启用插件（有序）；传 type 再筛支持该搜索类型的。响应插件增删 / 排序 / 启停 */
export function useSearchablePlugins(type?: MediaType): Plugin[] {
    const plugins = usePlugins();
    const [disabled] = useMMKVObject<string[]>(DISABLED_KEY, pluginMetaStore);
    return useMemo(() => {
        const disabledSet = new Set(disabled ?? []);
        return plugins.filter(
            plugin =>
                !disabledSet.has(plugin.platform) &&
                plugin.supportedMethods.has('search') &&
                (type === undefined ||
                    plugin.supportedSearchTypes === undefined ||
                    plugin.supportedSearchTypes.includes(type)),
        );
    }, [plugins, disabled, type]);
}

/**
 * 实现了指定全部方法的已启用插件（有序）；响应插件增删 / 排序 / 启停
 * 用于「能跑完整流程」的源筛选：插件方法可各自独立声明，故按流程所需方法集取交集（every），
 * 而非按展示能力（capabilitiesOf 的任一命中）——如榜单需 getTopLists + getTopListDetail、推荐需两个 getRecommendPlaylists* 方法
 * methods 传稳定引用（模块级常量）以获得 memo 化
 */
export function usePluginsWithMethods(
    methods: readonly PluginMethodName[],
): Plugin[] {
    const plugins = usePlugins();
    const [disabled] = useMMKVObject<string[]>(DISABLED_KEY, pluginMetaStore);
    return useMemo(() => {
        const disabledSet = new Set(disabled ?? []);
        return plugins.filter(
            plugin =>
                !disabledSet.has(plugin.platform) &&
                methods.every(method => plugin.supportedMethods.has(method)),
        );
    }, [plugins, disabled, methods]);
}

/** 订阅 disabledPlugins 键变化（模块级稳定函数，供 useSyncExternalStore） */
function subscribeDisabled(onStoreChange: () => void): () => void {
    const listener = pluginMetaStore.addOnValueChangedListener(key => {
        if (key === DISABLED_KEY) {
            onStoreChange();
        }
    });
    return () => listener.remove();
}

/**
 * 单插件启用态（细粒度：只重渲染状态真变的行）
 * disabledPlugins 是冻结的数组键；快照返 boolean，React 对未变的行 bail-out
 * 避免 50+ 插件时切一个导致整表重渲染
 */
export function usePluginEnabled(platform: string): boolean {
    return useSyncExternalStore(
        subscribeDisabled,
        () =>
            !(
                getObject<string[]>(pluginMetaStore, DISABLED_KEY) ?? []
            ).includes(platform),
    );
}

/** 单插件用户变量（per-platform 键，天然细粒度）；只读快照，要改由表单层显式拷贝 */
export function usePluginUserVariables(
    platform: string,
): Readonly<Record<string, string>> {
    const [vars] = useMMKVObject<Record<string, string>>(
        keyOfUserVariables(platform),
        pluginMetaStore,
    );
    return vars ?? EMPTY_VARS;
}

/** 单插件替代源（per-platform 键，天然细粒度） */
export function usePluginAlternative(platform: string): string | null {
    const [alt] = useMMKVObject<string>(
        keyOfAlternative(platform),
        pluginMetaStore,
    );
    return alt ?? null;
}

/** 单插件实时实体（按 platform 从内存态取，不存在返 undefined） */
export function usePlugin(platform: string): Plugin | undefined {
    return useAtomValue(pluginsAtom).get(platform);
}
