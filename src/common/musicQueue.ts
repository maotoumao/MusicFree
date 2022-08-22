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
// import musicController from './musicController';
import musicIsPaused from '@/utils/musicIsPaused';

console.log(TrackPlayer);

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

/** 内部使用的排序id */
let globalId: number = 0; // 记录加入队列的次序

/** 初始化 */
const setupMusicQueue = async () => {
  // 需要hook一下播放，所以采用这种方式
  await TrackPlayer.reset();
  await TrackPlayer.setRepeatMode(RepeatMode.Off);
  musicQueue.length = 0;
  // 不要依赖playbackchanged，不稳定,
  // 一首歌结束了
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async () => {
    if (repeatMode === MusicRepeatMode.SINGLE) {
      await play(undefined, true);
    } else {
      await skipToNext();
    }
  });

  TrackPlayer.addEventListener(Event.PlaybackError, async () => {
    await skipToNext();
  });
  TrackPlayer.addEventListener(Event.PlaybackTrackChanged, async evt => {
    // 是track里的，不是playlist里的
    if (!(await TrackPlayer.getTrack(evt.nextTrack))?.url) {
      if (repeatMode === MusicRepeatMode.SINGLE) {
        await play(undefined, true);
      } else {
        await skipToNext();
      }
    }
  });
};

type NotifyCallBacksKey = 'musicQueue' | 'repeatMode' | 'currentIndex';
/** 对应属性更新后，同步更新状态 */
const notifyCallBacks: Record<NotifyCallBacksKey, Set<Function>> = {
  musicQueue: new Set([]),
  repeatMode: new Set([]),
  currentIndex: new Set([]),
};

const notifyState = (key: NotifyCallBacksKey | Array<NotifyCallBacksKey>) => {
  if (!Array.isArray(key)) {
    key = [key];
  }
  const _cbs = key.map(k => notifyCallBacks[k]);
  let cbs = _cbs.reduce((prev, curr) => new Set([...prev, ...curr]));
  cbs.forEach(cb => cb());
};

/** 队列相关 */
const getMusicQueue = () => musicQueue;

function useMusicQueue() {
  const [_musicQueueState, _setMusicQueueState] = useState(musicQueue);
  const updateMusicQueue = () => {
    _setMusicQueueState(musicQueue);
  };

  useEffect(() => {
    notifyCallBacks.musicQueue.add(updateMusicQueue);
    return () => {
      notifyCallBacks.musicQueue.delete(updateMusicQueue);
    };
  }, []);

  return _musicQueueState;
}

/** 播放模式相关 */
function useRepeatMode() {
  const [_repeatMode, _setRepeatMode] = useState(repeatMode);
  const updateRepeatMode = () => {
    _setRepeatMode(repeatMode);
  };

  useEffect(() => {
    notifyCallBacks.repeatMode.add(updateRepeatMode);
    return () => {
      notifyCallBacks.repeatMode.delete(updateRepeatMode);
    };
  }, []);
  return _repeatMode;
}

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
        (a, b) => a?._internalData?.globalId - b?._internalData?.globalId ?? 0,
      );
    });
  }
  currentIndex = findMusicIndex(currentMusicItem);
  repeatMode = mode;
  notifyState(['repeatMode', 'currentIndex', 'musicQueue']);
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
) => {
  const _musicItems = musicItems
    .map(item =>
      produce(item, draft => {
        draft._internalData = {
          globalId: ++globalId,
        };
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
  notifyState('musicQueue');
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
  notifyState(['musicQueue', 'currentIndex']);
};

/** 播放音乐 */
const play = async (musicItem?: IMusic.IMusicItem, forcePlay?: boolean) => {
  const _currentIndex = findMusicIndex(musicItem);

  if (_currentIndex === currentIndex) {
    // 如果暂停就继续播放，否则
    const currentTrack = await TrackPlayer.getTrack(0);
    if (forcePlay && currentTrack) {
      _playTrack(currentTrack);
      return;
    }
    const state = await TrackPlayer.getState();
    if (currentTrack) {
      if (musicIsPaused(state)) {
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
  let track: Track;

  // 本地播放
  if (_musicItem?._internalData?.localPath) {
    track = produce(_musicItem, draft => {
      draft.url = draft._internalData!.localPath;
    }) as Track;
  } else {
    // 插件播放
    const plugin = pluginManager.getPlugin(_musicItem.platform);
    if (plugin && plugin.instance.playMusic) {
      try {
        const {url, headers} =
          (await plugin.instance.playMusic(_musicItem)) ?? {};
        if (!url) {
          throw new Error();
        }
        track = produce(_musicItem, draft => {
          draft.url = url;
          draft.headers = headers;
          draft.userAgent = headers?.['user-agent'];
        }) as Track;
      } catch (e) {
        console.log(e);
        track = _musicItem as Track;
      }
    } else {
      track = _musicItem as Track;
    }
  }
  musicQueue[currentIndex] = track as IMusic.IMusicItem;
  notifyState('currentIndex');
  try {
    await _playTrack(track);
  } catch (e) {
    await TrackPlayer.setupPlayer();
    await _playTrack(track);
  }
};

const _playTrack = async (track: Track) => {
  await TrackPlayer.reset();
  await TrackPlayer.add([track, {url: ''}]);
  await TrackPlayer.play();
};

const playWithReplaceQueue = async (
  musicItem: IMusic.IMusicItem,
  newQueue: IMusic.IMusicItem[],
) => {
  if (newQueue.length !== 0) {
    musicQueue = [];
    addAll(newQueue);
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

function useCurrentMusicItem() {
  const [_currentMusicItem, _setCurrentMusicItem] =
    useState<IMusic.IMusicItem | null>(musicQueue[currentIndex] ?? null);
  const updateCurrentMusicItem = () => {
    _setCurrentMusicItem(musicQueue[currentIndex] ?? null);
  };

  useEffect(() => {
    notifyCallBacks.musicQueue.add(updateCurrentMusicItem);
    notifyCallBacks.currentIndex.add(updateCurrentMusicItem);
    return () => {
      notifyCallBacks.musicQueue.delete(updateCurrentMusicItem);
      notifyCallBacks.currentIndex.delete(updateCurrentMusicItem);
    };
  }, []);
  return _currentMusicItem;
}


async function stop() {
  await TrackPlayer.stop();
  await TrackPlayer.destroy();
}
const MusicQueue = {
  setupMusicQueue,
  getMusicQueue,
  useMusicQueue,
  addAll,
  add,
  addNext,
  skipToNext,
  skipToPrevious,
  play,
  playWithReplaceQueue,
  pause,
  remove,
  useCurrentMusicItem,
  useRepeatMode,
  toggleRepeatMode,
  MusicRepeatMode,
  usePlaybackState,
  MusicState: State,
  useProgress,
  seekTo: TrackPlayer.seekTo,
  stop,
  currentIndex
};

export default MusicQueue;
