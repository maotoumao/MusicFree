import {atomWithStorage, loadable} from 'jotai/utils';
import {atom} from 'jotai';
import storage from './storage';

interface ICurrentMusicState {
  musicItem?: IMusic.IMusicItem;
  progress?: number;
  mode: string; // todo 改掉
}

// 当前音乐配置
const currentMusicState: ICurrentMusicState = {
  musicItem: {
    id: 'xxsad',
    platform: 'upupfun',
    artist: '猫头猫',
    duration: 40,
    album: '小喵',
    title: '一首歌',
    artwork: 'https://i0.hdslb.com/bfs/article/ca1a9e1c3cf2055a4f04472aa19879b8db6bfce9.gif'

  },
  progress: 15,
  mode: 'series',
};
const currentMusicStateAtom = atomWithStorage<typeof currentMusicState>(
  'current-music',
  currentMusicState,
  storage,
);

const loadableCurrentMusicStateAtom = loadable(currentMusicStateAtom);

// 当前音乐播放
const musicPlayingState = false;
const musicPlayingStateAtom = atom(musicPlayingState);

// 当前播放列表配置
const currentPlayListState = {
  playList: [],
};
const currentPlayListStateAtom = atomWithStorage<typeof currentPlayListState>(
  'current-play-list',
  currentPlayListState,
  storage,
);

export {
  currentMusicStateAtom,
  currentPlayListStateAtom,
  loadableCurrentMusicStateAtom,
  musicPlayingStateAtom,
};
