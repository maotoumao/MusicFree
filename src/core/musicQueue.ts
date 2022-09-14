import produce from 'immer';
import TrackPlayer, {
    Event,
    RepeatMode,
    State,
    Track,
    usePlaybackState,
    useProgress,
} from 'react-native-track-player';
import shuffle from 'lodash.shuffle';
import musicIsPaused from '@/utils/musicIsPaused';
import Config from './config';
import {internalSymbolKey} from '@/constants/commonConst';
import StateMapper from '@/utils/stateMapper';
import delay from '@/utils/delay';
import {errorLog, trace} from '../utils/log';
import {isSameMediaItem, mergeProps} from '@/utils/mediaItem';
import PluginManager from './pluginManager';
import Cache from './cache';
import Network from './network';
import Toast from '@/utils/toast';

enum MusicRepeatMode {
    /** 随机播放 */
    SHUFFLE = 'SHUFFLE',
    /** 列表循环 */
    QUEUE = 'QUEUE',
    /** 单曲循环 */
    SINGLE = 'SINGLE',
}

/** 核心的状态 */
let currentIndex: number = -1;
let musicQueue: Array<IMusic.IMusicItem> = [];
let repeatMode: MusicRepeatMode = MusicRepeatMode.QUEUE;
let isPlaying: boolean = false;

const getRepeatMode = () => repeatMode;

const currentMusicStateMapper = new StateMapper(() => musicQueue[currentIndex]);
const musicQueueStateMapper = new StateMapper(() => musicQueue);
const repeatModeStateMapper = new StateMapper(getRepeatMode);

/** 内部使用的排序id */
let globalId: number = 0; // 记录加入队列的次序

const maxMusicQueueLength = 1500; // 当前播放最大限制
const halfMaxMusicQueueLength = Math.floor(maxMusicQueueLength / 2);

/** 初始化 */
const setup = async () => {
    // 需要hook一下播放，所以采用这种方式
    await TrackPlayer.reset();
    await TrackPlayer.setRepeatMode(RepeatMode.Off);

    musicQueue.length = 0;
    /** 状态恢复 */
    try {
        const config = await Config.get('status.music');
        if (config?.repeatMode) {
            repeatMode = config.repeatMode as MusicRepeatMode;
        }
        if (config?.musicQueue && Array.isArray(config?.musicQueue)) {
            addAll(
                config.musicQueue,
                undefined,
                true,
                repeatMode === MusicRepeatMode.SHUFFLE,
            );
        }
        if (config?.track) {
            currentIndex = findMusicIndex(config.track);
            // todo： 判空，理论上不会发生
            await TrackPlayer.add([config.track as Track, getFakeNextTrack()]);
        }

        if (config?.progress) {
            await TrackPlayer.seekTo(config.progress);
        }
        trace('状态恢复', config);
    } catch (e) {
        errorLog('状态恢复失败', e);
    }
    // 不要依赖playbackchanged，不稳定,
    // 一首歌结束了
    TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async () => {
        if (repeatMode === MusicRepeatMode.SINGLE) {
            await play(undefined, true);
        } else {
            await skipToNext();
        }
    });
    let badTrack: ICommon.IMediaBase | null = null;
    TrackPlayer.addEventListener(Event.PlaybackState, async data => {
        if (data.state === State.None) {
            const track = await TrackPlayer.getTrack(0);
            if (!track) {
                return;
            }
            if (
                isSameMediaItem(
                    track as unknown as ICommon.IMediaBase,
                    badTrack,
                )
            ) {
                // 这是一个坏掉的track
            } else {
                // 缓存过期的情况
                Cache.remove(track as unknown as ICommon.IMediaBase);
                badTrack = track as unknown as ICommon.IMediaBase;
                if (isPlaying) {
                    play(track as IMusic.IMusicItem);
                } else {
                    replaceTrack({...track, url: ''}, false);
                }
            }
        }
    });

    TrackPlayer.addEventListener(Event.PlaybackError, async e => {
        errorLog('Player播放失败', e);
        await _playFail();
    });

    currentMusicStateMapper.notify();
    repeatModeStateMapper.notify();
};

/** 播放模式相关 */
const _toggleRepeatMapping = {
    [MusicRepeatMode.SHUFFLE]: MusicRepeatMode.SINGLE,
    [MusicRepeatMode.SINGLE]: MusicRepeatMode.QUEUE,
    [MusicRepeatMode.QUEUE]: MusicRepeatMode.SHUFFLE,
};
const toggleRepeatMode = () => {
    setRepeatMode(_toggleRepeatMapping[repeatMode]);
};

const setRepeatMode = (mode: MusicRepeatMode) => {
    const currentMusicItem = musicQueue[currentIndex];
    if (mode === MusicRepeatMode.SHUFFLE) {
        musicQueue = shuffle(musicQueue);
    } else {
        musicQueue = produce(musicQueue, draft => {
            return draft.sort(
                (a, b) =>
                    a?.[internalSymbolKey]?.globalId -
                        b?.[internalSymbolKey]?.globalId ?? 0,
            );
        });
    }
    currentIndex = findMusicIndex(currentMusicItem);
    repeatMode = mode;
    TrackPlayer.updateMetadataForTrack(1, getFakeNextTrack());
    // 记录
    Config.set('status.music.repeatMode', mode, false);
    repeatModeStateMapper.notify();
    currentMusicStateMapper.notify();
    musicQueueStateMapper.notify();
};

// 获取目标item下标
const findMusicIndex = (musicItem?: IMusic.IMusicItem) =>
    musicItem
        ? musicQueue.findIndex(
              queueMusicItem =>
                  queueMusicItem.id === musicItem.id &&
                  queueMusicItem.platform === musicItem.platform,
          )
        : currentIndex;

const shrinkMusicQueueToSize = (
    queue: IMusic.IMusicItem[],
    targetIndex = currentIndex,
) => {
    // 播放列表上限，太多无法缓存状态
    if (queue.length > maxMusicQueueLength) {
        if (targetIndex < halfMaxMusicQueueLength) {
            queue = queue.slice(0, maxMusicQueueLength);
        } else {
            const right = Math.min(
                queue.length,
                targetIndex + halfMaxMusicQueueLength,
            );
            const left = Math.max(0, right - maxMusicQueueLength);
            queue = queue.slice(left, right);
        }
    }
    return queue;
};

const addAll = (
    musicItems: Array<IMusic.IMusicItem> = [],
    beforeIndex?: number,
    notCache?: boolean,
    shouldShuffle?: boolean,
) => {
    const _musicItems = musicItems
        .map(item =>
            produce(item, draft => {
                if (draft[internalSymbolKey]) {
                    draft[internalSymbolKey].globalId = ++globalId;
                } else {
                    draft[internalSymbolKey] = {
                        globalId: ++globalId,
                    };
                }
            }),
        )
        .filter(_ => findMusicIndex(_) === -1);
    if (beforeIndex === undefined) {
        musicQueue = musicQueue.concat(_musicItems);
    } else {
        musicQueue = produce(musicQueue, draft => {
            draft.splice(beforeIndex, 0, ..._musicItems);
        });
    }
    // 播放列表上限，太多无法缓存状态
    musicQueue = shrinkMusicQueueToSize(
        musicQueue,
        findMusicIndex(_musicItems[0]),
    );
    if (!notCache) {
        Config.set('status.music.musicQueue', musicQueue, false);
    }
    if (shouldShuffle) {
        musicQueue = shuffle(musicQueue);
    }
    musicQueueStateMapper.notify();
};

/** 追加到队尾 */
const add = (musicItem: IMusic.IMusicItem, beforeIndex?: number) => {
    addAll([musicItem], beforeIndex);
};

const addNext = (musicItem: IMusic.IMusicItem) => {
    const shouldPlay = musicQueue.length === 0;
    add(musicItem, currentIndex + 1);
    if (shouldPlay) {
        play(musicItem);
    }
};

const remove = async (musicItem: IMusic.IMusicItem) => {
    const _ind = findMusicIndex(musicItem);
    // 移除的是当前项
    if (_ind === currentIndex) {
        // 停下
        await TrackPlayer.reset();
        musicQueue = produce(musicQueue, draft => {
            draft.splice(_ind, 1);
        });
        if (musicQueue.length === 0) {
            currentIndex = -1;
        } else {
            currentIndex = currentIndex % musicQueue.length;
            play();
        }
    } else if (_ind !== -1 && _ind < currentIndex) {
        musicQueue = produce(musicQueue, draft => {
            draft.splice(_ind, 1);
        });
        currentIndex -= 1;
    } else {
        musicQueue = produce(musicQueue, draft => {
            draft.splice(_ind, 1);
        });
    }
    Config.set('status.music.musicQueue', musicQueue, false);
    musicQueueStateMapper.notify();
    currentMusicStateMapper.notify();
};
/**
 * 获取自动播放的下一个track
 */
const getFakeNextTrack = () => {
    let track: Track | undefined;
    if (repeatMode === MusicRepeatMode.SINGLE) {
        track = musicQueue[currentIndex] as Track;
    } else {
        track =
            musicQueue.length !== 0
                ? (musicQueue[(currentIndex + 1) % musicQueue.length] as Track)
                : undefined;
    }

    if (track) {
        return produce(track, _ => {
            _.url = '';
        });
    } else {
        return {url: ''};
    }
};

/** 播放音乐 */
const play = async (musicItem?: IMusic.IMusicItem, forcePlay?: boolean) => {
    try {
        trace('播放', musicItem);
        if (
            Network.isCellular() &&
            !Config.get('setting.basic.useCelluarNetworkPlay')
        ) {
            Toast.warn('当前设置移动网络不可播放，可在侧边栏基本设置中打开');
            return;
        }
        isPlaying = true;
        const _currentIndex = findMusicIndex(musicItem);
        if (!musicItem && _currentIndex === currentIndex && !forcePlay) {
            // 如果暂停就继续播放，否则
            const currentTrack = await TrackPlayer.getTrack(0);
            if (currentTrack && currentTrack.url) {
                const state = await TrackPlayer.getState();
                if (musicIsPaused(state)) {
                    trace('PLAY-继续播放', currentTrack);
                    await TrackPlayer.play();
                    return;
                }
                return;
            }
        }
        currentIndex = _currentIndex;

        if (currentIndex === -1) {
            if (musicItem) {
                add(musicItem);
                currentIndex = musicQueue.length - 1;
            } else {
                return;
            }
        }
        const _musicItem = musicQueue[currentIndex];
        let track: IMusic.IMusicItem;
        try {
            // 获取真实源
            const source = await PluginManager.getByName(
                _musicItem.platform,
            )?.methods?.getMediaSource(_musicItem);
            track = mergeProps(_musicItem, source) as IMusic.IMusicItem;
        } catch (e) {
            // 播放失败
            if (isSameMediaItem(_musicItem, musicQueue[currentIndex])) {
                await _playFail();
            }
            return;
        }
        /** 可能点了很多次。。。 */
        if (!isSameMediaItem(_musicItem, musicQueue[currentIndex])) {
            return;
        }
        musicQueue[currentIndex] = track;
        await replaceTrack(track as Track);
        currentMusicStateMapper.notify();
    } catch (e: any) {
        if (
            e?.message ===
            'The player is not initialized. Call setupPlayer first.'
        ) {
            trace('重新初始化player', '');
            await TrackPlayer.setupPlayer();
            play(musicItem, forcePlay);
        }
    }
};

const replaceTrack = async (track: Track, autoPlay = true) => {
    await TrackPlayer.reset();
    await TrackPlayer.add([track, getFakeNextTrack()]);
    if (autoPlay) {
        await TrackPlayer.play();
    }
    Config.set('status.music.track', track as IMusic.IMusicItem, false);
    Config.set('status.music.progress', 0, false);
};

const _playFail = async () => {
    errorLog('播放失败，自动跳过', {
        currentIndex,
    });
    await TrackPlayer.reset();
    await TrackPlayer.add([
        (musicQueue[currentIndex] ?? {url: ''}) as Track,
        getFakeNextTrack(),
    ]);
    if (!Config.get('setting.basic.autoStopWhenError')) {
        await delay(300);
        await skipToNext();
    }
};

const playWithReplaceQueue = async (
    musicItem: IMusic.IMusicItem,
    newQueue: IMusic.IMusicItem[],
) => {
    if (newQueue.length !== 0) {
        newQueue = shrinkMusicQueueToSize(
            newQueue,
            newQueue.findIndex(_ => isSameMediaItem(_, musicItem)),
        );
        musicQueue = [];
        addAll(
            newQueue,
            undefined,
            undefined,
            repeatMode === MusicRepeatMode.SHUFFLE,
        );
        await play(musicItem, true);
    }
};

const pause = async () => {
    isPlaying = false;
    await TrackPlayer.pause();
};

const skipToNext = async () => {
    if (musicQueue.length === 0) {
        currentIndex = -1;
        return;
    }

    await play(musicQueue[(currentIndex + 1) % musicQueue.length], true);
};

const skipToPrevious = async () => {
    if (musicQueue.length === 0) {
        currentIndex = -1;
        return;
    }
    if (currentIndex === -1) {
        currentIndex = 0;
    }
    await play(
        musicQueue[(currentIndex - 1 + musicQueue.length) % musicQueue.length],
        true,
    );
};

async function stop() {
    await TrackPlayer.stop();
}
const MusicQueue = {
    setup,
    useMusicQueue: musicQueueStateMapper.useMappedState,
    addAll,
    add,
    addNext,
    skipToNext,
    skipToPrevious,
    play,
    playWithReplaceQueue,
    pause,
    remove,
    useCurrentMusicItem: currentMusicStateMapper.useMappedState,
    useRepeatMode: repeatModeStateMapper.useMappedState,
    getRepeatMode,
    toggleRepeatMode,
    MusicRepeatMode,
    usePlaybackState,
    MusicState: State,
    useProgress,
    seekTo: TrackPlayer.seekTo,
    stop,
    currentIndex,
};

export default MusicQueue;
