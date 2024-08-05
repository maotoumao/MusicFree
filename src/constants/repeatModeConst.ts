import {MusicRepeatMode} from '@/core/trackPlayer';

export default {
    [MusicRepeatMode.QUEUE]: {
        icon: 'repeat-song-1',
        text: '列表循环',
    },
    [MusicRepeatMode.SINGLE]: {
        icon: 'repeat-song',
        text: '单曲循环',
    },
    [MusicRepeatMode.SHUFFLE]: {
        icon: 'shuffle',
        text: '随机播放',
    },
} as const;
