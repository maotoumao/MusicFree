/**
 * 歌词反应式读取层（React hooks）：只读，状态由 Lyric 管理器发布
 */
import { useAtomValue } from 'jotai';

import { currentLineAtom, lyricAtom, lyricOffsetAtom } from './store';

import type { ActiveLine, LyricOffset, LyricState } from './types';

/** 当前歌词内容（状态 + 歌词行 + 元信息） */
export function useLyric(): LyricState {
    return useAtomValue(lyricAtom);
}

/** 当前应高亮的歌词行 */
export function useCurrentLyricLine(): ActiveLine {
    return useAtomValue(currentLineAtom);
}

/** 当前歌词时间轴偏移（有效偏移和用户手动偏移） */
export function useLyricOffset(): LyricOffset {
    return useAtomValue(lyricOffsetAtom);
}
