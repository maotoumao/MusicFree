/**
 * 播放器反应式读取层（React hooks）：只读，写操作统一走命令式 Player（IPlayer）
 * 每个 hook 订阅一个 store atom，按状态细粒度更新，避免无关变化引起重渲染
 */
import { atom, useAtomValue } from 'jotai';

import {
    currentMusicAtom,
    playbackRateAtom,
    playbackStateAtom,
    preferredQualityAtom,
    progressAtom,
    queueAtom,
    repeatModeAtom,
} from './store';

import type { RepeatMode } from './types';
import type { PlaybackState, Progress } from '@/native/audioEngine';
import type { MusicItem, QualityKey } from '@/types';

const durationAtom = atom(get => get(progressAtom).duration);

/** 当前歌曲（null 表示未播放、已停止或队列已清空） */
export function useCurrentMusic(): MusicItem | null {
    return useAtomValue(currentMusicAtom);
}

/** 播放队列快照（只读；修改走 IPlayer 的队列命令） */
export function useQueue(): readonly MusicItem[] {
    return useAtomValue(queueAtom);
}

export function useRepeatMode(): RepeatMode {
    return useAtomValue(repeatModeAtom);
}

export function usePreferredQuality(): QualityKey {
    return useAtomValue(preferredQualityAtom);
}

export function usePlaybackState(): PlaybackState {
    return useAtomValue(playbackStateAtom);
}

/** 播放进度（position、duration、buffered，单位为秒）；由引擎按 onProgress 间隔更新 */
export function useProgress(): Progress {
    return useAtomValue(progressAtom);
}

function useDuration(): number {
    return useAtomValue(durationAtom);
}

export function usePlaybackRate(): number {
    return useAtomValue(playbackRateAtom);
}

export { useDuration };
