/**
 * 歌单模块的 React hook：只读，写入通过命令式 playlist（IPlaylist）完成
 */
import { useAtomValue } from 'jotai';
import { selectAtom } from 'jotai/utils';
import { useMemo } from 'react';

import { mediaKey } from '@/utils/media';

import {
    favoriteKeysAtom,
    loadedDetailsAtom,
    localPlaylistsAtom,
    playlistStatusAtom,
    starredKeysAtom,
    starredPlaylistsAtom,
} from './store';

import type {
    LocalPlaylist,
    LocalPlaylistDetail,
    PlaylistStatus,
    StarredPlaylist,
} from './types';
import type { MediaRef } from '@/types';

/** Local 歌单摘要列表（favorite 恒居首，只读） */
export function useLocalPlaylists(): readonly LocalPlaylist[] {
    return useAtomValue(localPlaylistsAtom);
}

/** 歌单存储健康状态 */
export function usePlaylistStatus(): PlaylistStatus {
    return useAtomValue(playlistStatusAtom);
}

/** 已加载的歌单详情（含 favorite）；未加载返回 undefined；只在该 id 的详情变化时重渲 */
export function useLoadedPlaylistDetail(
    id: string,
): LocalPlaylistDetail | undefined {
    const selector = useMemo(
        () => selectAtom(loadedDetailsAtom, details => details.get(id)),
        [id],
    );
    return useAtomValue(selector);
}

/** 曲目是否在 favorite 中；只在该曲目收藏态翻转时重渲（按 mediaKey 派生，避免整表订阅的扇出） */
export function useIsFavorite(ref: MediaRef): boolean {
    const key = mediaKey(ref);
    const selector = useMemo(
        () => selectAtom(favoriteKeysAtom, keys => keys.has(key)),
        [key],
    );
    return useAtomValue(selector);
}

/** Starred（收藏的远程歌单）列表，只读 */
export function useStarredPlaylists(): readonly StarredPlaylist[] {
    return useAtomValue(starredPlaylistsAtom);
}

/** 远程歌单是否已收藏；只在该歌单收藏态翻转时重渲（按 mediaKey 派生，避免整表订阅的扇出） */
export function useIsPlaylistStarred(ref: MediaRef): boolean {
    const key = mediaKey(ref);
    const selector = useMemo(
        () => selectAtom(starredKeysAtom, keys => keys.has(key)),
        [key],
    );
    return useAtomValue(selector);
}
