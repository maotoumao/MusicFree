/**
 * 插件元数据存储：MMKV plugin-meta，一个 store 两类 key
 * ① 用户设置（legacy 冻结 key，升级保留）：disabledPlugins / order / {platform}.userVariables / {platform}.alternativePlugin
 * ② 注册表（元数据缓存，新 key）：{platform}.meta
 * 持久化真相源即 MMKV；React 侧反应式经 useMMKV*（2d hooks），本类不建 jotai 镜像
 */
import { getObject, getOrCreateMMKV, setObject } from '@/infra/storage';

import type { PluginMetaRecord } from './types';

/**
 * MMKV store id 是持久化契约，沿用 legacy，勿改
 * 导出供 hooks.ts 反应式订阅（模块内共享，不进 index barrel）
 */
export const pluginMetaStore = getOrCreateMMKV('plugin-meta');

const META_SUFFIX = '.meta';
export const DISABLED_KEY = 'disabledPlugins';
export const ORDER_KEY = 'order';
/** 待删清单：未被采纳的陌生文件名（编译失败/注册表写不进）→ 首次发现的时间戳（保留期机制用） */
const QUARANTINE_KEY = '_quarantine';
/** 卸载待删清单：已卸载但源码文件尚未删掉的文件名（防启动对账收养复活） */
const TOMBSTONE_KEY = '_tombstone';
/** 上次自动更新插件的发起时间（epoch ms）：节流用，非用户数据、不进备份 */
const LAST_AUTO_UPDATE_ATTEMPT_KEY = '_lastAutoUpdateAttemptAt';
const keyOfMeta = (platform: string) => `${platform}${META_SUFFIX}`;
export const keyOfUserVariables = (platform: string) =>
    `${platform}.userVariables`;
const ALTERNATIVE_SUFFIX = '.alternativePlugin';
export const keyOfAlternative = (platform: string) =>
    `${platform}${ALTERNATIVE_SUFFIX}`;

export class PluginMeta {
    // —— 注册表（元数据缓存，新 key）——

    getMeta(platform: string): PluginMetaRecord | undefined {
        return getObject<PluginMetaRecord>(
            pluginMetaStore,
            keyOfMeta(platform),
        );
    }

    setMeta(platform: string, record: PluginMetaRecord): void {
        setObject(pluginMetaStore, keyOfMeta(platform), record);
    }

    removeMeta(platform: string): void {
        pluginMetaStore.remove(keyOfMeta(platform));
    }

    /** 枚举全部注册表条目（platform → record）；setup 对账用 */
    getAllMeta(): Map<string, PluginMetaRecord> {
        const result = new Map<string, PluginMetaRecord>();
        for (const key of pluginMetaStore.getAllKeys()) {
            if (key.endsWith(META_SUFFIX)) {
                const record = getObject<PluginMetaRecord>(
                    pluginMetaStore,
                    key,
                );
                if (record) {
                    result.set(key.slice(0, -META_SUFFIX.length), record);
                }
            }
        }
        return result;
    }

    // —— 启用（disabledPlugins 反选：不在表内即启用）——

    getDisabled(): string[] {
        return getObject<string[]>(pluginMetaStore, DISABLED_KEY) ?? [];
    }

    isEnabled(platform: string): boolean {
        return !this.getDisabled().includes(platform);
    }

    setEnabled(platform: string, enabled: boolean): void {
        const disabled = new Set(this.getDisabled());
        if (enabled) {
            disabled.delete(platform);
        } else {
            disabled.add(platform);
        }
        setObject(pluginMetaStore, DISABLED_KEY, [...disabled]);
    }

    // —— 排序（wire 存 Record<platform, number>；有序数组转换在 Manager）——

    getOrderRecord(): Record<string, number> {
        return (
            getObject<Record<string, number>>(pluginMetaStore, ORDER_KEY) ?? {}
        );
    }

    setOrderRecord(order: Record<string, number>): void {
        setObject(pluginMetaStore, ORDER_KEY, order);
    }

    // —— 用户变量 ——

    getUserVariables(platform: string): Record<string, string> {
        return (
            getObject<Record<string, string>>(
                pluginMetaStore,
                keyOfUserVariables(platform),
            ) ?? {}
        );
    }

    setUserVariables(platform: string, vars: Record<string, string>): void {
        setObject(pluginMetaStore, keyOfUserVariables(platform), vars);
    }

    // —— 替代源 ——

    getAlternative(platform: string): string | null {
        return (
            getObject<string>(pluginMetaStore, keyOfAlternative(platform)) ??
            null
        );
    }

    setAlternative(platform: string, altPlatform: string | null): void {
        // null 清除该项（getAlternative 读缺失即回 null，语义等价）
        setObject(
            pluginMetaStore,
            keyOfAlternative(platform),
            altPlatform ?? undefined,
        );
    }

    /** 枚举全部替代源（platform → altPlatform）；备份快照用，含已卸载 platform 保留的偏好 */
    getAllAlternatives(): Map<string, string> {
        const result = new Map<string, string>();
        for (const key of pluginMetaStore.getAllKeys()) {
            if (key.endsWith(ALTERNATIVE_SUFFIX)) {
                const alt = getObject<string>(pluginMetaStore, key);
                if (alt) {
                    result.set(key.slice(0, -ALTERNATIVE_SUFFIX.length), alt);
                }
            }
        }
        return result;
    }

    // —— 待删清单（编译失败的陌生文件，按文件名记首次坏掉时间）——

    getQuarantine(): Record<string, number> {
        return (
            getObject<Record<string, number>>(
                pluginMetaStore,
                QUARANTINE_KEY,
            ) ?? {}
        );
    }

    setQuarantine(ledger: Record<string, number>): void {
        setObject(pluginMetaStore, QUARANTINE_KEY, ledger);
    }

    // —— 卸载待删清单（已卸载但源码文件尚未删掉的文件名；启动对账据此不收养、继续删）——

    getTombstone(): string[] {
        return getObject<string[]>(pluginMetaStore, TOMBSTONE_KEY) ?? [];
    }

    setTombstone(files: string[]): void {
        setObject(pluginMetaStore, TOMBSTONE_KEY, files);
    }

    // —— 自动更新节流 ——

    /** 上次自动更新的发起时间（epoch ms，成败都记）；从未跑过返回 0 */
    getLastAutoUpdateAttemptAt(): number {
        return (
            getObject<number>(pluginMetaStore, LAST_AUTO_UPDATE_ATTEMPT_KEY) ??
            0
        );
    }

    setLastAutoUpdateAttemptAt(at: number): void {
        setObject(pluginMetaStore, LAST_AUTO_UPDATE_ATTEMPT_KEY, at);
    }
}
