import produce from 'immer';
import {useEffect, useState} from 'react';
import TrackPlayer, {
  Event,
  RepeatMode,
  State,
  Track,
  usePlaybackState,
  useProgress,
} from 'react-native-track-player';
import {pluginManager} from './pluginManager';
import shuffle from 'lodash.shuffle';
import musicIsPaused from '@/utils/musicIsPaused';
import {getConfig, setConfig} from './localConfigManager';
import {internalSerialzeKey, internalSymbolKey} from '@/constants/commonConst';
import StateMapper from '@/utils/stateMapper';
import DownloadManager from './downloadManager';
import delay from '@/utils/delay';
import {exists} from 'react-native-fs';
import {errorLog, trace} from '../utils/log';
import {getCache, updateCache} from './cacheManager';
import { isSameMediaItem } from '@/utils/mediaItem';

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

const currentMusicStateMapper = new StateMapper(() => musicQueue[currentIndex]);
const musicQueueStateMapper = new StateMapper(() => musicQueue);
const repeatModeStateMapper = new StateMapper(() => repeatMode);

/** 内部使用的排序id */
let globalId: number = 0; // 记录加入队列的次序

/** 初始化 */
const setupMusicQueue = async () => {
  // 需要hook一下播放，所以采用这种方式
  await TrackPlayer.reset();
  await TrackPlayer.setRepeatMode(RepeatMode.Off);

  musicQueue.length = 0;
  /** 状态恢复 */
  try {
    const config = await getConfig('status.music');
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
      const track = await getMusicTrack(config.track);
      await TrackPlayer.add([track, getFakeNextTrack()]);
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

  TrackPlayer.addEventListener(Event.PlaybackError, async e => {
    errorLog('Player播放失败', e);
    await _playFail();
  });

  /** 播放下一个 */
  TrackPlayer.addEventListener(Event.PlaybackTrackChanged, async evt => {
    // 是track里的，不是playlist里的
    if (
      evt.nextTrack === 1 &&
      !(await TrackPlayer.getTrack(evt.nextTrack))?.url
    ) {
      if (repeatMode === MusicRepeatMode.SINGLE) {
        await play(undefined, true);
      } else {
        await skipToNext();
      }
    }
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
          a?.[internalSymbolKey]?.globalId - b?.[internalSymbolKey]?.globalId ??
          0,
      );
    });
  }
  currentIndex = findMusicIndex(currentMusicItem);
  repeatMode = mode;
  TrackPlayer.updateMetadataForTrack(1, getFakeNextTrack());
  // 记录
  setConfig('status.music.repeatMode', mode, false);
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
  if (!notCache) {
    setConfig('status.music.musicQueue', musicQueue, false);
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
  setConfig('status.music.musicQueue', musicQueue, false);
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

/** 获取真实的url */
const getMusicTrack = async (
  musicItem: IMusic.IMusicItem,
  retryCount = 1,
): Promise<Track> => {
  let track: Track;

  const localPath =
    musicItem?.[internalSymbolKey]?.localPath ??
    DownloadManager.getDownloaded(musicItem)?.[internalSymbolKey]?.localPath;
  // 1. 本地下载
  if (localPath && (await exists(localPath))) {
    track = produce(musicItem, draft => {
      draft.url = localPath;
    }) as Track;
  } else {
    // 插件播放
    // 2. 缓存
    const internalData = getCache(musicItem)?.[internalSerialzeKey];
    if (internalData?.url) {
      return {
        url: internalData.url,
        headers: internalData?.headers,
        userAgent: internalData?.userAgent,
      };
    }
    // 3. 插件解析
    const plugin = pluginManager.getPlugin(musicItem.platform);
    if (plugin && plugin.instance.getMusicTrack) {
      try {
        const {url, headers} =
          (await plugin.instance.getMusicTrack(musicItem)) ?? {};
        if (!url) {
          throw new Error();
        }
        track = produce(musicItem, draft => {
          draft.url = url;
          draft.headers = headers;
          draft.userAgent = headers?.['user-agent'];
        }) as Track;
      } catch (e) {
        if (retryCount > 0) {
          await delay(150);
          return getMusicTrack(musicItem, --retryCount);
        } else {
          // 播放失败,可以用配置
          errorLog('获取真实URL失败', e);
          throw new Error('TRACK FAIL');
        }
      }
    } else {
      track = musicItem as Track;
    }
  }
  // 写入缓存
  updateCache(musicItem, {
    [internalSerialzeKey]: {
      url: track.url,
      headers: track.headers,
      userAgent: track.userAgent,
    },
  });
  return track;
};

/** 播放音乐 */
const play = async (musicItem?: IMusic.IMusicItem, forcePlay?: boolean) => {
  try {
    const _currentIndex = findMusicIndex(musicItem);
    if (!musicItem && _currentIndex === currentIndex) {
      // 如果暂停就继续播放，否则
      const currentTrack = await TrackPlayer.getTrack(0);
      if (forcePlay && currentTrack) {
        trace('PLAY-重新播放', currentTrack);
        _playTrack(currentTrack);
        return;
      }
      if (currentTrack) {
        const state = await TrackPlayer.getState();
        if (musicIsPaused(state)) {
          trace('PLAY-继续播放', currentTrack);
          // todo: 如果没有url pluginmethods.getrealtrack
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
      track = (await getMusicTrack(_musicItem)) as IMusic.IMusicItem;
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
    await _playTrack(track as Track);
    currentMusicStateMapper.notify();
  } catch (e: any) {
    if (
      e?.message === 'The player is not initialized. Call setupPlayer first.'
    ) {
      trace('重新初始化player', '');
      await TrackPlayer.setupPlayer();
      play(musicItem, forcePlay);
    }
  }
};

const _playTrack = async (track: Track) => {
  await TrackPlayer.reset();
  await TrackPlayer.add([track, getFakeNextTrack()]);
  await TrackPlayer.play();
  setConfig('status.music.track', track as IMusic.IMusicItem, false);
  setConfig('status.music.progress', 0, false);
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
  if (!getConfig('setting.basic.autoStopWhenError')) {
    await delay(300);
    await skipToNext();
  }
};

const playWithReplaceQueue = async (
  musicItem: IMusic.IMusicItem,
  newQueue: IMusic.IMusicItem[],
) => {
  if (newQueue.length !== 0) {
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
  setupMusicQueue,
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
