/**
 * 播放器的反应式状态层：core Player 通过 setXxx 发布，React 侧 hooks 通过 useAtomValue 读取
 * 这里只保存 UI 需要反应式感知的状态；命令走 IPlayer，持久化走 session（这里不镜像 MMKV）
 * 权威状态仍由 Player、PlayQueue 和 SlotController 持有，这些 atom 只是它们发布的只读镜像
 *
 * 发布与读取一律走 `uiMirror`：后台不写 atom、只压最新值，回前台一次刷入。
 * 后台播放时进度每 500ms 一拍，直写会在不可见期间堆出成千上万条 mount 指令，
 * 回前台一次排空即卡住 UI 线程数秒。这些 atom 的订阅者全是 React，故可安全缓冲；
 * 程序读走 `readLatest`，拿到的永远是最新值
 */
import { atom } from 'jotai';

import { publishToUi, readLatest } from '@/infra/uiMirror';
import { PlaybackState } from '@/native/audioEngine';

import { RepeatMode } from './types';

import type { Progress } from '@/native/audioEngine';
import type { MusicItem, QualityKey } from '@/types';

/** 初始进度：位置、时长和缓冲均为 0（尚未加载音源） */
const INITIAL_PROGRESS: Progress = { position: 0, duration: 0, buffered: 0 };

export const currentMusicAtom = atom<MusicItem | null>(null);
export const queueAtom = atom<readonly MusicItem[]>([]);
export const repeatModeAtom = atom<RepeatMode>(RepeatMode.Queue);
export const preferredQualityAtom = atom<QualityKey>('standard');
export const playbackStateAtom = atom<PlaybackState>(PlaybackState.Idle);
export const progressAtom = atom<Progress>(INITIAL_PROGRESS);
export const playbackRateAtom = atom<number>(1);

export function setCurrentMusic(item: MusicItem | null): void {
    publishToUi(currentMusicAtom, item);
}

export function setQueue(items: readonly MusicItem[]): void {
    publishToUi(queueAtom, items);
}

export function setRepeatMode(mode: RepeatMode): void {
    publishToUi(repeatModeAtom, mode);
}

export function setPreferredQuality(quality: QualityKey): void {
    publishToUi(preferredQualityAtom, quality);
}

export function setPlaybackState(state: PlaybackState): void {
    publishToUi(playbackStateAtom, state);
}

export function getPlaybackState(): PlaybackState {
    return readLatest(playbackStateAtom);
}

export function setProgress(progress: Progress): void {
    publishToUi(progressAtom, progress);
}

export function getProgress(): Progress {
    return readLatest(progressAtom);
}

export function setPlaybackRate(rate: number): void {
    publishToUi(playbackRateAtom, rate);
}
