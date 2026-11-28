/**
 * 本地音乐库 live 真相源（运行时内存态）
 * - libraryAtom：扫描缓存快照；atomWithLazy 首次读取时同步 hydrate（不进浏览页不占内存）；null=无有效快照（从未扫描/损坏）
 * - scanProgressAtom：扫描进度（运行时、不持久化）
 * 设置（sort/scanSettings）真相源=MMKV、不镜像 atom（见 index）；变更一律替换、不原地 mutate
 */
import { atom } from 'jotai';
import { atomWithLazy, selectAtom } from 'jotai/utils';

import { getObject, getOrCreateMMKV } from '@/infra/storage';
import { publishToUi, readLatest } from '@/infra/uiMirror';
import { coerceMusicItem } from '@/utils/media';

import {
    DEFAULT_SORT,
    LOCAL_LIBRARY_KEY,
    LOCAL_LIBRARY_SCHEMA_VERSION,
    LOCAL_MUSIC_STORE_ID,
    SORT_BYS,
} from './types';

import type { LocalLibrary, LocalSort, ScanProgress } from './types';

const IDLE_PROGRESS: ScanProgress = {
    status: 'idle',
    found: 0,
    processed: 0,
    total: 0,
    currentPath: '',
};

/** 库快照运行时真相源（class 唯一 writer、扫描增量更新）
 *  atomWithLazy：首次被读取时同步从 MMKV hydrate（不进浏览页不占内存）
 *  null = 无有效快照（从未扫描/损坏/读失败）→ UI 待扫描；空库（musicByPath={}）= 扫过为空 → 空态 */
export const libraryAtom = atomWithLazy<LocalLibrary | null>(hydrateLibrary);
/** 扫描进度（纯运行时、不持久化） */
export const scanProgressAtom = atom<ScanProgress>(IDLE_PROGRESS);
/** 扫描状态派生（selectAtom：只 status 变才通知订阅者，避免扫描中每批进度重渲编排层） */
export const scanStatusAtom = selectAtom(scanProgressAtom, p => p.status);

/** 命令式读库（扫描/删除基线）：无快照当空库；UI 用 useAtomValue(libraryAtom) 保留 null 语义 */
export function getLibrary(): LocalLibrary {
    return readLatest(libraryAtom) ?? EMPTY_LIBRARY;
}

export function setLibrary(next: LocalLibrary): void {
    publishToUi(libraryAtom, next);
}

/** 清空库运行时态：库归 null（无有效快照 → 待扫描）、进度重置 idle；MMKV 快照由 index 层清 */
export function resetLibrary(): void {
    publishToUi(libraryAtom, null);
    publishToUi(scanProgressAtom, IDLE_PROGRESS);
}

export function getScanProgress(): ScanProgress {
    return readLatest(scanProgressAtom);
}
export function setScanProgress(next: ScanProgress): void {
    publishToUi(scanProgressAtom, next);
}

/** 空库（命令式 getLibrary 无快照兑底 / 扫描基线） */
const EMPTY_LIBRARY: LocalLibrary = {
    version: LOCAL_LIBRARY_SCHEMA_VERSION,
    musicByPath: {},
    files: {},
};

/** 记录型对象（非 null、非数组） */
function isRecord(x: unknown): x is Record<string, unknown> {
    return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** 持久化 library 结构校验（读外部存储=系统边界）；顶层或任一记录项损坏 → null=无有效快照
 *  深度校验每项（复用 coerceMusicItem）：可解析但含损坏项（如 null value）也整份丢弃，胜过派生/序列化时崩 */
function validateLibrary(raw: unknown): LocalLibrary | null {
    const lib = raw as LocalLibrary | undefined;
    if (
        lib?.version !== LOCAL_LIBRARY_SCHEMA_VERSION ||
        !isRecord(lib.musicByPath) ||
        !isRecord(lib.files)
    ) {
        return null;
    }
    for (const item of Object.values(lib.musicByPath)) {
        if (coerceMusicItem(item) === null) {
            return null;
        }
    }
    for (const meta of Object.values(lib.files)) {
        if (!isRecord(meta)) {
            return null;
        }
    }
    return lib;
}

/** libraryAtom 惰性初值：首次读取时同步 hydrate；无 key/损坏/读失败 → null（无有效快照）；有效 → library（含空库） */
function hydrateLibrary(): LocalLibrary | null {
    try {
        const store = getOrCreateMMKV(LOCAL_MUSIC_STORE_ID);
        if (!store.contains(LOCAL_LIBRARY_KEY)) {
            return null;
        }
        return validateLibrary(
            getObject<LocalLibrary>(store, LOCAL_LIBRARY_KEY),
        );
    } catch {
        return null;
    }
}

/** 持久化 sort 校验（未知 by / 非布尔 desc 回落默认）；命令式 getSort 与 hook useLocalSort 共用避免不一致 */
export function validateSort(raw: unknown): LocalSort {
    const s = raw as LocalSort | undefined;
    if (s && SORT_BYS.includes(s.by) && typeof s.desc === 'boolean') {
        return { by: s.by, desc: s.desc };
    }
    return DEFAULT_SORT;
}
