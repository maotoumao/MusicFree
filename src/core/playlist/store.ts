/**
 * Local + Starred playlists 的 client state（jotai）
 * Playlist（命令式）经 setter 整表替换，React 侧订阅；变更一律新数组/新值，不原地 mutate
 */
import { atom } from 'jotai';

import { atomStore } from '@/utils/atomStore';

import type {
    LocalPlaylist,
    LocalPlaylistDetail,
    PlaylistStatus,
    StarredPlaylist,
} from './types';

/** Local playlist 摘要列表（favorite 恒居首） */
export const localPlaylistsAtom = atom<readonly LocalPlaylist[]>([]);
/** 存储健康状态 */
export const playlistStatusAtom = atom<PlaylistStatus>('ready');
/** favorite 成员键集，供 O(1) 响应式 isFavorite */
export const favoriteKeysAtom = atom<ReadonlySet<string>>(new Set<string>());
/** 已加载歌单详情（含 favorite），供详情视图响应式订阅 */
export const loadedDetailsAtom = atom<ReadonlyMap<string, LocalPlaylistDetail>>(
    new Map(),
);

/** Starred（收藏的远程歌单）快照列表 */
export const starredPlaylistsAtom = atom<readonly StarredPlaylist[]>([]);
/** starred 成员键集，供 O(1) 响应式 isPlaylistStarred */
export const starredKeysAtom = atom<ReadonlySet<string>>(new Set<string>());

export function getLocalPlaylists(): readonly LocalPlaylist[] {
    return atomStore.get(localPlaylistsAtom);
}

export function getStarredPlaylists(): readonly StarredPlaylist[] {
    return atomStore.get(starredPlaylistsAtom);
}

export function setLocalPlaylists(next: readonly LocalPlaylist[]): void {
    atomStore.set(localPlaylistsAtom, next);
}

export function setPlaylistStatus(next: PlaylistStatus): void {
    atomStore.set(playlistStatusAtom, next);
}

export function setFavoriteKeys(next: ReadonlySet<string>): void {
    atomStore.set(favoriteKeysAtom, next);
}

export function setStarredPlaylists(next: readonly StarredPlaylist[]): void {
    atomStore.set(starredPlaylistsAtom, next);
}

export function setStarredKeys(next: ReadonlySet<string>): void {
    atomStore.set(starredKeysAtom, next);
}

export function setLoadedDetail(id: string, detail: LocalPlaylistDetail): void {
    const next = new Map(atomStore.get(loadedDetailsAtom));
    next.set(id, detail);
    atomStore.set(loadedDetailsAtom, next);
}

export function removeLoadedDetails(ids: readonly string[]): void {
    const current = atomStore.get(loadedDetailsAtom);
    let next: Map<string, LocalPlaylistDetail> | undefined;
    for (const id of ids) {
        if (current.has(id)) {
            next ??= new Map(current);
            next.delete(id);
        }
    }
    if (next) {
        atomStore.set(loadedDetailsAtom, next);
    }
}

export function clearLoadedDetails(): void {
    atomStore.set(loadedDetailsAtom, new Map<string, LocalPlaylistDetail>());
}
