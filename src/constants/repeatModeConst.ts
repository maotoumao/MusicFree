import MusicQueue from "@/common/musicQueue";
export default {
    [MusicQueue.MusicRepeatMode.QUEUE]: {
      icon: 'repeat',
      text: '列表循环'
    },
    [MusicQueue.MusicRepeatMode.SINGLE]: {
      icon: 'repeat-once',
      text: '单曲循环'
    },
    [MusicQueue.MusicRepeatMode.SHUFFLE]: {
      icon: 'shuffle',
      text: '随机播放'
    }
  }
  