import produce from 'immer';
import ReactNativeTrackPlayer, {
    Event,
    State,
    Track,
    TrackMetadataBase,
    usePlaybackState,
    useProgress,
} from 'react-native-track-player';
import shuffle from 'lodash.shuffle';
import Config from '../config';
import {
    EDeviceEvents,
    internalFakeSoundKey,
    sortIndexSymbol,
    timeStampSymbol,
} from '@/constants/commonConst';
import {GlobalState} from '@/utils/stateMapper';
import delay from '@/utils/delay';
import {
    isSameMediaItem,
    mergeProps,
    sortByTimestampAndIndex,
} from '@/utils/mediaItem';
import Network from '../network';
import LocalMusicSheet from '../localMusicSheet';
import {SoundAsset} from '@/constants/assetsConst';
import {getQualityOrder} from '@/utils/qualities';
import musicHistory from '../musicHistory';
import getUrlExt from '@/utils/getUrlExt';
import {DeviceEventEmitter} from 'react-native';
import LyricManager from '../lyricManager';
import {MusicRepeatMode} from './common';
import {
    getMusicIndex,
    getPlayList,
    getPlayListMusicAt,
    isInPlayList,
    isPlayListEmpty,
    setPlayList,
    usePlayList,
} from './internal/playList';
import {createMediaIndexMap} from '@/utils/mediaIndexMap';
import PluginManager from '../pluginManager';
import {musicIsPaused} from '@/utils/trackUtils';
import Toast from '@/utils/toast';

/** 当前播放 */
const currentMusicStore = new GlobalState<IMusic.IMusicItem | null>(null);

/** 播放模式 */
const repeatModeStore = new GlobalState<MusicRepeatMode>(MusicRepeatMode.QUEUE);

/** 音质 */
const qualityStore = new GlobalState<IMusic.IQualityKey>('standard');

let currentIndex = -1;

// TODO: 下个版本最大限制调大一些
const maxMusicQueueLength = 1500; // 当前播放最大限制
const halfMaxMusicQueueLength = Math.floor(maxMusicQueueLength / 2);
const shrinkPlayListToSize = (
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

async function setupTrackPlayer() {
    const config = Config.get('status.music') ?? {};
    const {rate, repeatMode, musicQueue, progress, track} = config;

    // 状态恢复
    if (rate) {
        await ReactNativeTrackPlayer.setRate(+rate / 100);
    }

    if (musicQueue && Array.isArray(musicQueue)) {
        addAll(musicQueue, undefined, repeatMode === MusicRepeatMode.SHUFFLE);
    }

    const currentQuality =
        Config.get('setting.basic.defaultPlayQuality') ?? 'standard';

    if (track && isInPlayList(track)) {
        const newSource = await PluginManager.getByMedia(
            track,
        )?.methods.getMediaSource(track, currentQuality, 0);
        // 重新初始化 获取最新的链接
        track.url = newSource?.url || track.url;
        track.headers = newSource?.headers || track.headers;

        await setTrackSource(track as Track, false);
        setCurrentMusic(track);

        if (config?.progress) {
            await ReactNativeTrackPlayer.seekTo(progress!);
        }
    }

    // 初始化事件
    ReactNativeTrackPlayer.addEventListener(
        Event.PlaybackActiveTrackChanged,
        async evt => {
            if (
                evt.index === 1 &&
                evt.lastIndex === 0 &&
                evt.track?.$ === internalFakeSoundKey
            ) {
                if (repeatModeStore.getValue() === MusicRepeatMode.SINGLE) {
                    await play(null, true);
                } else {
                    // 当前生效的歌曲是下一曲的标记
                    await skipToNext('队列结尾');
                }
            }
        },
    );

    ReactNativeTrackPlayer.addEventListener(Event.PlaybackError, async () => {
        // 只关心第一个元素
        if ((await ReactNativeTrackPlayer.getActiveTrackIndex()) === 0) {
            failToPlay();
        }
    });
}

/**
 * 获取自动播放的下一个track
 */
const getFakeNextTrack = () => {
    let track: Track | undefined;
    const repeatMode = repeatModeStore.getValue();
    if (repeatMode === MusicRepeatMode.SINGLE) {
        // 单曲循环
        track = getPlayListMusicAt(currentIndex) as Track;
    } else {
        // 下一曲
        track = getPlayListMusicAt(currentIndex + 1) as Track;
    }

    if (track) {
        return produce(track, _ => {
            _.url = SoundAsset.fakeAudio;
            _.$ = internalFakeSoundKey;
        });
    } else {
        // 只有列表长度为0时才会出现的特殊情况
        return {url: SoundAsset.fakeAudio, $: internalFakeSoundKey} as Track;
    }
};

/** 播放失败时的情况 */
async function failToPlay(reason?: string) {
    // 如果自动跳转下一曲, 500s后自动跳转
    if (!Config.get('setting.basic.autoStopWhenError')) {
        await ReactNativeTrackPlayer.reset();
        await delay(500);
        await skipToNext('播放失败' + reason);
    }
}

// 播放模式相关
const _toggleRepeatMapping = {
    [MusicRepeatMode.SHUFFLE]: MusicRepeatMode.SINGLE,
    [MusicRepeatMode.SINGLE]: MusicRepeatMode.QUEUE,
    [MusicRepeatMode.QUEUE]: MusicRepeatMode.SHUFFLE,
};
/** 切换下一个模式 */
const toggleRepeatMode = () => {
    setRepeatMode(_toggleRepeatMapping[repeatModeStore.getValue()]);
};

/** 设置音源 */
const setTrackSource = async (track: Track, autoPlay = true) => {
    await ReactNativeTrackPlayer.setQueue([track, getFakeNextTrack()]);
    if (autoPlay) {
        await ReactNativeTrackPlayer.play();
    }
    // 写缓存 TODO: MMKV
    Config.set('status.music.track', track as IMusic.IMusicItem, false);
    Config.set('status.music.progress', 0, false);
};

/**
 * 添加到播放列表
 * @param musicItems 目标歌曲
 * @param beforeIndex 在第x首歌曲前添加
 * @param shouldShuffle 随机排序
 */
const addAll = (
    musicItems: Array<IMusic.IMusicItem> = [],
    beforeIndex?: number,
    shouldShuffle?: boolean,
) => {
    const now = Date.now();
    let newPlayList: IMusic.IMusicItem[] = [];
    let currentPlayList = getPlayList();
    const _musicItems = musicItems.map((item, index) =>
        produce(item, draft => {
            draft[timeStampSymbol] = now;
            draft[sortIndexSymbol] = index;
        }),
    );
    if (beforeIndex === undefined || beforeIndex < 0) {
        // 1.1. 添加到歌单末尾，并过滤掉已有的歌曲
        newPlayList = currentPlayList.concat(
            _musicItems.filter(item => !isInPlayList(item)),
        );
    } else {
        // 1.2. 新的播放列表，插入
        const indexMap = createMediaIndexMap(_musicItems);
        const beforeDraft = currentPlayList
            .slice(0, beforeIndex)
            .filter(item => !indexMap.has(item));
        const afterDraft = currentPlayList
            .slice(beforeIndex)
            .filter(item => !indexMap.has(item));

        newPlayList = [...beforeDraft, ..._musicItems, ...afterDraft];
    }

    // 如果太长了
    if (newPlayList.length > maxMusicQueueLength) {
        newPlayList = shrinkPlayListToSize(
            newPlayList,
            beforeIndex ?? newPlayList.length - 1,
        );
    }

    // 2. 如果需要随机
    if (shouldShuffle) {
        newPlayList = shuffle(newPlayList);
    }
    // 3. 设置播放列表
    setPlayList(newPlayList);
    const currentMusicItem = currentMusicStore.getValue();

    // 4. 重置下标
    if (currentMusicItem) {
        currentIndex = getMusicIndex(currentMusicItem);
    }

    // TODO: 更新播放队列信息
    // 5. 存储更新的播放列表信息
};

/** 追加到队尾 */
const add = (
    musicItem: IMusic.IMusicItem | IMusic.IMusicItem[],
    beforeIndex?: number,
) => {
    addAll(Array.isArray(musicItem) ? musicItem : [musicItem], beforeIndex);
};

/**
 * 下一首播放
 * @param musicItem
 */
const addNext = (musicItem: IMusic.IMusicItem | IMusic.IMusicItem[]) => {
    const shouldPlay = isPlayListEmpty();
    add(musicItem, currentIndex + 1);
    if (shouldPlay) {
        play(Array.isArray(musicItem) ? musicItem[0] : musicItem);
    }
};

const isCurrentMusic = (musicItem: IMusic.IMusicItem) => {
    return isSameMediaItem(musicItem, currentMusicStore.getValue()) ?? false;
};

const remove = async (musicItem: IMusic.IMusicItem) => {
    const playList = getPlayList();
    let newPlayList: IMusic.IMusicItem[] = [];
    let currentMusic: IMusic.IMusicItem | null = currentMusicStore.getValue();
    const targetIndex = getMusicIndex(musicItem);
    let shouldPlayCurrent: boolean | null = null;
    if (targetIndex === -1) {
        // 1. 这种情况应该是出错了
        return;
    }
    // 2. 移除的是当前项
    if (currentIndex === targetIndex) {
        // 2.1 停止播放，移除当前项
        newPlayList = produce(playList, draft => {
            draft.splice(targetIndex, 1);
        });
        // 2.2 设置新的播放列表，并更新当前音乐
        if (newPlayList.length === 0) {
            currentMusic = null;
            shouldPlayCurrent = false;
        } else {
            currentMusic = newPlayList[currentIndex % newPlayList.length];
            try {
                const state = (await ReactNativeTrackPlayer.getPlaybackState())
                    .state;
                if (musicIsPaused(state)) {
                    shouldPlayCurrent = false;
                } else {
                    shouldPlayCurrent = true;
                }
            } catch {
                shouldPlayCurrent = false;
            }
        }
    } else {
        // 3. 删除
        newPlayList = produce(playList, draft => {
            draft.splice(targetIndex, 1);
        });
    }

    setPlayList(newPlayList);
    setCurrentMusic(currentMusic);
    Config.set('status.music.musicQueue', playList, false);
    if (shouldPlayCurrent === true) {
        await play(currentMusic, true);
    } else if (shouldPlayCurrent === false) {
        await ReactNativeTrackPlayer.reset();
    }
};

/**
 * 设置播放模式
 * @param mode 播放模式
 */
const setRepeatMode = (mode: MusicRepeatMode) => {
    const playList = getPlayList();
    let newPlayList;
    if (mode === MusicRepeatMode.SHUFFLE) {
        newPlayList = shuffle(playList);
    } else {
        newPlayList = produce(playList, draft => {
            return sortByTimestampAndIndex(draft);
        });
    }

    setPlayList(newPlayList);
    const currentMusicItem = currentMusicStore.getValue();
    currentIndex = getMusicIndex(currentMusicItem);
    repeatModeStore.setValue(mode);
    // 更新下一首歌的信息
    ReactNativeTrackPlayer.updateMetadataForTrack(1, getFakeNextTrack());
    // 记录
    Config.set('status.music.repeatMode', mode, false);
};

/** 清空播放列表 */
const clear = async () => {
    setPlayList([]);
    setCurrentMusic(null);

    await ReactNativeTrackPlayer.reset();
    Config.set('status.music', {
        repeatMode: repeatModeStore.getValue(),
    });
};

/** 暂停 */
const pause = async () => {
    await ReactNativeTrackPlayer.pause();
};

const setCurrentMusic = (musicItem?: IMusic.IMusicItem | null) => {
    if (!musicItem) {
        currentIndex = -1;
        currentMusicStore.setValue(null);
    }
    currentIndex = getMusicIndex(musicItem);
    currentMusicStore.setValue(musicItem!);
};

/**
 * 播放
 *
 * 当musicItem 为空时，代表暂停/播放
 *
 * @param musicItem
 * @param forcePlay
 * @returns
 */
const play = async (
    musicItem?: IMusic.IMusicItem | null,
    forcePlay?: boolean,
) => {
    try {
        if (!musicItem) {
            musicItem = currentMusicStore.getValue();
        }
        if (!musicItem) {
            throw new Error(PlayFailReason.PLAY_LIST_IS_EMPTY);
        }
        // 1. 移动网络禁止播放
        if (
            Network.isCellular() &&
            !Config.get('setting.basic.useCelluarNetworkPlay') &&
            !LocalMusicSheet.isLocalMusic(musicItem)
        ) {
            await ReactNativeTrackPlayer.reset();
            throw new Error(PlayFailReason.FORBID_CELLUAR_NETWORK_PLAY);
        }

        // 2. 如果是当前正在播放的音频
        if (isCurrentMusic(musicItem)) {
            const currentTrack = await ReactNativeTrackPlayer.getTrack(0);
            // 2.1 如果当前有源
            if (
                currentTrack?.url &&
                isSameMediaItem(musicItem, currentTrack as IMusic.IMusicItem)
            ) {
                const currentActiveIndex =
                    await ReactNativeTrackPlayer.getActiveTrackIndex();
                if (currentActiveIndex !== 0) {
                    await ReactNativeTrackPlayer.skip(0);
                }
                if (forcePlay) {
                    // 2.1.1 强制重新开始
                    await ReactNativeTrackPlayer.seekTo(0);
                } else if (
                    (await ReactNativeTrackPlayer.getPlaybackState()).state !==
                    State.Playing
                ) {
                    // 2.1.2 恢复播放
                    await ReactNativeTrackPlayer.play();
                }
                // 这种情况下，播放队列和当前歌曲都不需要变化
                return;
            }
            // 2.2 其他情况：重新获取源
        }

        // 3. 如果没有在播放列表中，添加到队尾；同时更新列表状态
        const inPlayList = isInPlayList(musicItem);
        if (!inPlayList) {
            add(musicItem);
        }

        // 4. 更新列表状态和当前音乐
        setCurrentMusic(musicItem);

        // 5. 获取音源
        let track: IMusic.IMusicItem;

        // 5.1 通过插件获取音源
        const plugin = PluginManager.getByName(musicItem.platform);
        // 5.2 获取音质排序
        const qualityOrder = getQualityOrder(
            Config.get('setting.basic.defaultPlayQuality') ?? 'standard',
            Config.get('setting.basic.playQualityOrder') ?? 'asc',
        );
        // 5.3 插件返回音源
        let source: IPlugin.IMediaSourceResult | null = null;
        for (let quality of qualityOrder) {
            if (isCurrentMusic(musicItem)) {
                source =
                    (await plugin?.methods?.getMediaSource(
                        musicItem,
                        quality,
                    )) ?? null;
                // 5.3.1 获取到真实源
                if (source) {
                    qualityStore.setValue(quality);
                    break;
                }
            } else {
                // 5.3.2 已经切换到其他歌曲了，
                return;
            }
        }

        if (!isCurrentMusic(musicItem)) {
            return;
        }

        if (!source) {
            // 5.4 没有返回源
            if (!musicItem.url) {
                throw new Error(PlayFailReason.INVALID_SOURCE);
            }
            source = {
                url: musicItem.url,
            };
            qualityStore.setValue('standard');
        }

        // 6. 特殊类型源
        if (getUrlExt(source.url) === '.m3u8') {
            // @ts-ignore
            source.type = 'hls';
        }
        // 7. 合并结果
        track = mergeProps(musicItem, source) as IMusic.IMusicItem;

        // 8. 新增历史记录
        musicHistory.addMusic(musicItem);

        // 9. 设置音源
        await setTrackSource(track as Track);

        // 10. 获取补充信息
        let info: Partial<IMusic.IMusicItem> | null = null;
        try {
            info = (await plugin?.methods?.getMusicInfo?.(musicItem)) ?? null;
        } catch {}

        // 11. 设置补充信息
        if (info && isCurrentMusic(musicItem)) {
            const mergedTrack = mergeProps(track, info);
            currentMusicStore.setValue(mergedTrack as IMusic.IMusicItem);
            await ReactNativeTrackPlayer.updateMetadataForTrack(
                0,
                mergedTrack as TrackMetadataBase,
            );
        }

        // 12. 刷新歌词信息
        if (
            !isSameMediaItem(
                LyricManager.getLyricState()?.lyricParser?.getCurrentMusicItem?.(),
                musicItem,
            )
        ) {
            DeviceEventEmitter.emit(EDeviceEvents.REFRESH_LYRIC, true);
        }
    } catch (e: any) {
        const message = e?.message;
        if (
            message === 'The player is not initialized. Call setupPlayer first.'
        ) {
            await ReactNativeTrackPlayer.setupPlayer();
            play(musicItem, forcePlay);
        } else if (message === PlayFailReason.FORBID_CELLUAR_NETWORK_PLAY) {
            Toast.warn(
                '当前禁止移动网络播放音乐，如需播放请去侧边栏-基本设置中修改',
            );
        } else if (message === PlayFailReason.INVALID_SOURCE) {
            await failToPlay('无效源');
        } else if (message === PlayFailReason.PLAY_LIST_IS_EMPTY) {
            // 队列是空的，不应该出现这种情况
        }
    }
};

/**
 * 播放音乐，同时替换播放队列
 * @param musicItem 音乐
 * @param newPlayList 替代列表
 */
const playWithReplacePlayList = async (
    musicItem: IMusic.IMusicItem,
    newPlayList: IMusic.IMusicItem[],
) => {
    if (newPlayList.length !== 0) {
        const now = Date.now();
        if (newPlayList.length > maxMusicQueueLength) {
            newPlayList = shrinkPlayListToSize(
                newPlayList,
                newPlayList.findIndex(it => isSameMediaItem(it, musicItem)),
            );
        }
        const playListItems = newPlayList.map((item, index) =>
            produce(item, draft => {
                draft[timeStampSymbol] = now;
                draft[sortIndexSymbol] = index;
            }),
        );
        setPlayList(
            repeatModeStore.getValue() === MusicRepeatMode.SHUFFLE
                ? shuffle(playListItems)
                : playListItems,
        );
        await play(musicItem, true);
    }
};

const skipToNext = async (reason?: string) => {
    console.log(
        'SkipToNext',
        reason,
        await ReactNativeTrackPlayer.getActiveTrack(),
    );
    if (isPlayListEmpty()) {
        setCurrentMusic(null);
        return;
    }

    await play(getPlayListMusicAt(currentIndex + 1), true);
};

const skipToPrevious = async () => {
    if (isPlayListEmpty()) {
        setCurrentMusic(null);
        return;
    }

    await play(getPlayListMusicAt(currentIndex === -1 ? 0 : currentIndex - 1));
};

/** 修改当前播放的音质 */
const changeQuality = async (newQuality: IMusic.IQualityKey) => {
    // 获取当前的音乐和进度
    if (newQuality === qualityStore.getValue()) {
        return true;
    }

    // 获取当前歌曲
    const musicItem = currentMusicStore.getValue();
    if (!musicItem) {
        return false;
    }
    try {
        const progress = await ReactNativeTrackPlayer.getProgress();
        const plugin = PluginManager.getByMedia(musicItem);
        const newSource = await plugin?.methods?.getMediaSource(
            musicItem,
            newQuality,
        );
        if (!newSource?.url) {
            throw new Error(PlayFailReason.INVALID_SOURCE);
        }
        if (isCurrentMusic(musicItem)) {
            const playingState = (
                await ReactNativeTrackPlayer.getPlaybackState()
            ).state;
            await setTrackSource(
                mergeProps(musicItem, newSource) as unknown as Track,
                !musicIsPaused(playingState),
            );

            await ReactNativeTrackPlayer.seekTo(progress.position ?? 0);
            qualityStore.setValue(newQuality);
        }
        return true;
    } catch {
        // 修改失败
        return false;
    }
};

enum PlayFailReason {
    /** 禁止移动网络播放 */
    FORBID_CELLUAR_NETWORK_PLAY = 'FORBID_CELLUAR_NETWORK_PLAY',
    /** 播放列表为空 */
    PLAY_LIST_IS_EMPTY = 'PLAY_LIST_IS_EMPTY',
    /** 无效源 */
    INVALID_SOURCE = 'INVALID_SOURCE',
    /** 非当前音乐 */
}

function useMusicState() {
    const playbackState = usePlaybackState();

    return playbackState.state;
}

function getPreviousMusic() {
    const currentMusicItem = currentMusicStore.getValue();
    if (!currentMusicItem) {
        return null;
    }

    return getPlayListMusicAt(currentIndex - 1);
}

function getNextMusic() {
    const currentMusicItem = currentMusicStore.getValue();
    if (!currentMusicItem) {
        return null;
    }

    return getPlayListMusicAt(currentIndex + 1);
}

const TrackPlayer = {
    setupTrackPlayer,
    usePlayList,
    getPlayList,
    addAll,
    add,
    addNext,
    skipToNext,
    skipToPrevious,
    play,
    playWithReplacePlayList,
    pause,
    remove,
    clear,
    useCurrentMusic: currentMusicStore.useValue,
    getCurrentMusic: currentMusicStore.getValue,
    useRepeatMode: repeatModeStore.useValue,
    getRepeatMode: repeatModeStore.getValue,
    toggleRepeatMode,
    usePlaybackState,
    getProgress: ReactNativeTrackPlayer.getProgress,
    useProgress: useProgress,
    seekTo: ReactNativeTrackPlayer.seekTo,
    changeQuality,
    useCurrentQuality: qualityStore.useValue,
    getCurrentQuality: qualityStore.getValue,
    getRate: ReactNativeTrackPlayer.getRate,
    setRate: ReactNativeTrackPlayer.setRate,
    useMusicState,
    reset: ReactNativeTrackPlayer.reset,
    getPreviousMusic,
    getNextMusic,
};

export default TrackPlayer;
export {MusicRepeatMode, State as MusicState};
