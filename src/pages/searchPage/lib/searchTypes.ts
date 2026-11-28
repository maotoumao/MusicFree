import type { MediaType } from '@/types';

/** 搜索可渲染的媒体类型（有序，对齐类型 Tab：单曲 / 专辑 / 歌手 / 歌单）；不含 lyric——UI 不搜歌词 */
export const SEARCH_TYPES = [
    'music',
    'album',
    'artist',
    'playlist',
] as const satisfies readonly MediaType[];

/** 搜索类型轴的单一真相源：派生自 SEARCH_TYPES */
export type SearchType = (typeof SEARCH_TYPES)[number];
