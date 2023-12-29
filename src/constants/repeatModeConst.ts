import {MusicRepeatMode} from '@/core/trackPlayer';

export default {
    [MusicRepeatMode.QUEUE]: {
        icon: 'repeat',
        text: '列表循环',
    },
    [MusicRepeatMode.SINGLE]: {
        icon: 'repeat-once',
        text: '单曲循环',
    },
    [MusicRepeatMode.SHUFFLE]: {
        icon: 'shuffle-variant',
        text: '随机播放',
    },
};
