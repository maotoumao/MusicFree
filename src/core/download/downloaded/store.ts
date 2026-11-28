/**
 * 已下载库的存储：MMKV 持久层 + 供 React 订阅的运行时镜像
 *
 * 真相源只有 MMKV。本库**一首歌一个 key**（分片存），为的是避免整表写回——每条记录带一份
 * 完整的 MusicItem 快照，整表存一个 key 的话每下完一首都要序列化全表，而 MMKV 写是同步的；
 * 分片还顺带隔离了单条损坏。代价是「集合变了」只能观察整个 store，而 `useMMKVObject`
 * 一次只能盯一个 key，故列表视图需要一份镜像。
 *
 * **镜像由监听驱动、不由写入方手工同步**——写侧只管写 MMKV，这里经
 * `addOnValueChangedListener` 自己跟上，双写漏一处的 bug 类别因此不存在（规范 §4.5 flavor 3）
 *
 * 注意镜像只服务集合视图：单曲「下过没」的 key 在调用时就知道，命令式查询直读 MMKV
 * （见 `index.ts` 的 `#read`），React 侧亦可直接 `useMMKVObject(key, store)`
 *
 * 持久化数据是系统边界，读写都经 `coerceDownloadedEntry` 校验 + 生成独立快照，单条损坏隔离丢弃
 */
import { getDefaultStore } from 'jotai';
import { atomWithLazy } from 'jotai/utils';

import {
    getObject,
    getOrCreateMMKV,
    getStoreVersion,
    setObject,
    setStoreVersion,
} from '@/infra/storage';
import { cloneJson } from '@/utils/json';
import { coerceMusicItem, isQualityKey, mediaKey } from '@/utils/media';

import { DOWNLOADED_SCHEMA_VERSION, DOWNLOADED_STORE_ID } from './types';

import type { DownloadedEntry, DownloadedFile } from './types';
import type { MMKV } from 'react-native-mmkv';

/** 扩展名语法：小写字母数字、无点（与 native 容器嗅探产出一致；不硬编码格式白名单） */
const EXTENSION_PATTERN = /^[a-z0-9]+$/;

/**
 * 已下载库的内存镜像（mediaKey → 条目），**监听同步维护**
 *
 * 原地改而非每次克隆：批量删几百首会打成同样多次监听回调，逐次克隆即 O(N²)。
 * React 那份是它的副本，按微任务合批发布（见 `publish`）——
 * 于是「命令式查询要当下的事实」与「界面不要一帧抖几百次」两个诉求各自满足
 */
const live = new Map<string, DownloadedEntry>();

/** live 是否已建立（hydrate 过）；空库与未初始化要分开 */
let hydrated = false;

/**
 * 已下载库运行时镜像（mediaKey → 条目）：atomWithLazy 首次读取时同步 hydrate
 * 用 Map 而非数组：支 O(1) 按身份查（下载态判定），同时供「已完成」列表遍历
 * 发布一律替换整个 Map（不原地 mutate），保引用变更可被订阅与缓存感知
 */
export const downloadedAtom =
    atomWithLazy<ReadonlyMap<string, DownloadedEntry>>(hydrateDownloaded);

/**
 * 命令式读镜像：供「路径 → 哪条记录」反查（内存遍历，不用 parse 全库 JSON）
 *
 * 返回的是**同步维护**的那份，不是 atom——atom 的发布晚一个微任务，
 * 拿它当删除依据会漏掉刚写入还没发布的记录，留下悬空条目
 *
 * 只读：写侧一律只写 MMKV，镜像由监听自己跟
 */
export function getDownloadedEntries(): ReadonlyMap<string, DownloadedEntry> {
    if (!hydrated) {
        getDefaultStore().get(downloadedAtom); // 触发 hydrate，它会填好 live
    }
    return live;
}

/**
 * downloadedAtom 惰性初值：**先订阅再全量读**（单条损坏跳过）；未知版本 / 读失败 → 空库
 * 顺序不可换：反过来会漏掉两步之间发生的写入
 */
function hydrateDownloaded(): ReadonlyMap<string, DownloadedEntry> {
    hydrated = true;
    try {
        const store = openDownloadedStore();
        if (store === null) {
            return new Map();
        }
        watchDownloaded(store);
        for (const entry of listDownloaded(store)) {
            live.set(entry.mediaKey, entry);
        }
    } catch {
        // 读不出来就当空库；live 保持现状（此时它本就是空的）
    }
    return new Map(live);
}

/** 有值即表示本 tick 已排好一次发布 */
let publishScheduled = false;

/**
 * 订阅本库的一切写入，把变更同步投影进 live、并合批发布给 React；只由 hydrate 调用一次
 * 回调只给 key 名，按 key 回读做增量 patch，不整表重读重校验
 */
function watchDownloaded(store: MMKV): void {
    store.addOnValueChangedListener(key => {
        if (key.startsWith('$')) {
            return; // $version 等保留键不是数据
        }
        const entry = readDownloaded(store, key);
        // 读不到 = 被删或已损坏，两种情况镜像里都不该再留着
        if (entry) live.set(key, entry);
        else live.delete(key);
        if (publishScheduled) {
            return; // 已排好发布，搭这一班车
        }
        publishScheduled = true;
        queueMicrotask(() => {
            publishScheduled = false;
            getDefaultStore().set(downloadedAtom, new Map(live));
        });
    });
}

/**
 * 打开已下载库 MMKV（懒开 + 版本门控）；未知版本（未来 schema / 降级安装）返 null，不按当前结构误读
 * 0 = 尚未写入的空库（兼容）；版本号在首次写入时落
 */
export function openDownloadedStore(): MMKV | null {
    const store = getOrCreateMMKV(DOWNLOADED_STORE_ID);
    const version = getStoreVersion(store);
    return version === 0 || version === DOWNLOADED_SCHEMA_VERSION
        ? store
        : null;
}

/** 按 mediaKey 读一条已下载记录；损坏或身份不一致返回 undefined */
export function readDownloaded(
    store: MMKV,
    key: string,
): DownloadedEntry | undefined {
    const entry = coerceDownloadedEntry(getObject<unknown>(store, key));
    // MMKV key 必须与身份一致，否则视为漂移丢弃
    return entry && entry.mediaKey === key ? entry : undefined;
}

/** 全量读取（运行时快照 hydrate 用）：跳过 $version 等保留键与损坏条目 */
export function listDownloaded(store: MMKV): DownloadedEntry[] {
    const out: DownloadedEntry[] = [];
    for (const key of store.getAllKeys()) {
        if (key.startsWith('$')) continue;
        const entry = readDownloaded(store, key);
        if (entry) out.push(entry);
    }
    return out;
}

/** 写入一条已下载记录（覆盖同 mediaKey）；返回实际落库快照（供同步运行时快照），非法或失败返 undefined */
export function writeDownloaded(
    store: MMKV,
    entry: DownloadedEntry,
): DownloadedEntry | undefined {
    const snapshot = coerceDownloadedEntry(entry);
    if (!snapshot) return undefined;
    // 先落版本号再写记录：$version 表 schema 而非「写过数据」，空的 v1 store 是合法状态；
    // 反序会留下「版本 0 却含 v1 数据」的歧义，令未来迁移无法判定 0 的含义
    if (getStoreVersion(store) === 0) {
        setStoreVersion(store, DOWNLOADED_SCHEMA_VERSION);
    }
    return setObject(store, snapshot.mediaKey, snapshot) ? snapshot : undefined;
}

/** 从已下载库删除一条（删文件后摘记录） */
export function removeDownloaded(store: MMKV, key: string): void {
    setObject(store, key, undefined); // undefined = 删 key
}

/**
 * 校验并生成独立规范快照（不可信来源：持久化数据 / 插件 DTO）
 * item 先安全深拷贝再复校身份（自定义 toJSON 可能拷贝后丢字段），身份取自拷贝结果 = 实际落库内容
 * file 非法则整条丢弃：没有文件的下载记录无意义
 */
export function coerceDownloadedEntry(
    raw: unknown,
): DownloadedEntry | undefined {
    if (typeof raw !== 'object' || raw === null) return undefined;
    const r = raw as Record<string, unknown>;

    if (!coerceMusicItem(r.item)) return undefined;
    const cloned = cloneJson(r.item); // 不可序列化（循环引用 / BigInt / toJSON 抛错）→ undefined，不抛
    const item = cloned === undefined ? null : coerceMusicItem(cloned);
    if (!item) return undefined;

    const file = coerceFile(r.file);
    if (!file) return undefined;

    const key = mediaKey(item);
    if (typeof r.mediaKey === 'string' && r.mediaKey !== key) return undefined;
    return { item, mediaKey: key, file };
}

/** 校验一份文件（路径绝对裸路径、扩展名小写无点、字节与时间戳安全整数、音质合法） */
function coerceFile(raw: unknown): DownloadedFile | undefined {
    if (typeof raw !== 'object' || raw === null) return undefined;
    const f = raw as Record<string, unknown>;
    // 路径不允许首尾空白：它是去重、扫描匹配和删除的主键，否则会产生始终无法匹配的记录
    if (typeof f.path !== 'string' || !f.path.startsWith('/')) {
        return undefined;
    }
    if (
        typeof f.extension !== 'string' ||
        !EXTENSION_PATTERN.test(f.extension)
    ) {
        return undefined;
    }
    if (!Number.isSafeInteger(f.sizeBytes) || (f.sizeBytes as number) < 0) {
        return undefined;
    }
    if (
        !Number.isSafeInteger(f.completedAt) ||
        (f.completedAt as number) <= 0
    ) {
        return undefined;
    }
    if (!isQualityKey(f.resolvedQuality)) {
        return undefined;
    }
    return {
        path: f.path,
        extension: f.extension,
        sizeBytes: f.sizeBytes as number,
        completedAt: f.completedAt as number,
        resolvedQuality: f.resolvedQuality,
    };
}
