/**
 * 本地音乐反应式读取层（React hooks）：只读，写全走命令式 localMusic
 * 内存态（libraryAtom/scanProgressAtom）→ useAtomValue；持久化态（sort）→ useMMKVObject
 * library 懒加载：useLazyLibrary 读 atomWithLazy，首次 store 读取时同步 hydrate（不进页不占内存）
 * 派生/排序经 useMemo + derive 层 WeakMap 缓存，只在 library 引用（扫描完才换）或 sort 变时重算
 */
import { useAtomValue } from 'jotai';
import { useMemo } from 'react';
import { useMMKVObject, useMMKVString } from 'react-native-mmkv';

import { getOrCreateMMKV } from '@/infra/storage';
import { safeParse } from '@/utils/json';

import {
    deriveCollections,
    sortedCollectionMusic,
    sortedMusicList,
} from './derive';
import {
    libraryAtom,
    scanProgressAtom,
    scanStatusAtom,
    validateSort,
} from './store';
import {
    LOCAL_MUSIC_STORE_ID,
    LOCAL_SCAN_SETTINGS_KEY,
    LOCAL_SORT_KEY,
} from './types';

import type {
    LocalCollectionByView,
    LocalCollectionView,
    LocalLibrary,
    LocalSort,
    ScanProgress,
    ScanSettings,
    ScanStatus,
} from './types';
import type { MusicItem } from '@/types';

/** 稳定空结果：library 无快照（null）时复用，避免每次 render 造新数组触发下游重渲 */
const EMPTY: readonly never[] = Object.freeze([]);

function useAddDownloadsToLibrary(): boolean {
    const store = getOrCreateMMKV(LOCAL_MUSIC_STORE_ID);
    const [stored] = useMMKVString(LOCAL_SCAN_SETTINGS_KEY, store);
    const settings = safeParse<Partial<ScanSettings>>(stored);
    return settings?.includeDownloadDir !== false;
}

/**
 * 懒加载库（atomWithLazy 首次读取即同步 hydrate）；null=尚无快照（待扫描）
 * 库就是扫描快照本身：下载的歌完成时已直接写入库，不在读路径另做合并
 */
function useLazyLibrary(): LocalLibrary | null {
    return useAtomValue(libraryAtom);
}

/** 全局排序（持久化态、经校验；写走命令式 localMusic.setSort） */
export function useLocalSort(): LocalSort {
    // MMKV 懒开延到 hook 执行（避免模块 import 即开 store）；getOrCreateMMKV 按 id 缓存复用
    const store = getOrCreateMMKV(LOCAL_MUSIC_STORE_ID);
    const raw = useMMKVObject<unknown>(LOCAL_SORT_KEY, store)[0];
    return useMemo(() => validateSort(raw), [raw]);
}

/** 全部本地曲目（按全局排序）；响应扫描完成 + 排序变更 */
export function useLocalMusicList(): readonly MusicItem[] {
    const library = useLazyLibrary();
    const sort = useLocalSort();
    return useMemo(
        () => (library ? sortedMusicList(library, sort) : EMPTY),
        [library, sort],
    );
}

/** 某视图的集合概览（内存派生、名称升序）；不受排序影响 */
export function useLocalCollections<V extends LocalCollectionView>(
    view: V,
): readonly LocalCollectionByView[V][] {
    const library = useLazyLibrary();
    return useMemo(
        () =>
            library
                ? (deriveCollections(
                      library,
                      view,
                  ) as readonly LocalCollectionByView[V][])
                : EMPTY,
        [library, view],
    );
}

/** 某集合的曲目（按全局排序） */
export function useCollectionMusic(
    view: LocalCollectionView,
    key: string,
): readonly MusicItem[] {
    const library = useLazyLibrary();
    const sort = useLocalSort();
    return useMemo(
        () =>
            library ? sortedCollectionMusic(library, view, key, sort) : EMPTY,
        [library, view, key, sort],
    );
}

/** 当前扫描进度（运行时态、扫描中高频变化）；只该被进度 UI 订阅，勿与列表混用 */
export function useScanProgress(): ScanProgress {
    return useAtomValue(scanProgressAtom);
}

/** 是否有已提交的 library 快照：区分「从未扫描/损坏→待扫描」vs「扫过为空→空态」
 *  从 libraryAtom 派生（null=无有效快照）；扫描写库→非 null，无需额外镜像或读 MMKV */
export function useHasLibrarySnapshot(): boolean {
    return useLazyLibrary() !== null;
}

/** 当前扫描状态（只 status、扫描中每批进度不触发）；编排层选状态分支用它，勿订阅整个 scanProgress */
export function useScanStatus(): ScanStatus {
    return useAtomValue(scanStatusAtom);
}

export { useAddDownloadsToLibrary };
