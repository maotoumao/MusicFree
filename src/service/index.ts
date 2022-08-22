import {ToastAndroid} from 'react-native';
// import MusicControl, {Command} from 'react-native-music-control';
import TrackPlayer, {Event} from 'react-native-track-player';
import MusicQueue from '../common/musicQueue';

module.exports = async function () {
  // MusicControl.on(Command.play, async () => {
  //   return await MusicQueue.play();
  // });
  // MusicControl.on(Command.pause, async () => {
  //   return await MusicQueue.pause();
  // });
  // MusicControl.on(Command.previousTrack, async () => {
  //   ToastAndroid.show('prev', ToastAndroid.LONG);
  //   return await MusicQueue.skipToPrevious();
  // });
  // MusicControl.on(Command.nextTrack, async () => {
  //   ToastAndroid.show('next', ToastAndroid.LONG);
  //   return await MusicQueue.skipToNext();
  // });

  TrackPlayer.addEventListener(Event.RemotePlay, () => MusicQueue.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => MusicQueue.pause());
  TrackPlayer.addEventListener(Event.RemotePrevious, () => MusicQueue.skipToPrevious());
  TrackPlayer.addEventListener(Event.RemoteNext, () => MusicQueue.skipToNext());
  TrackPlayer.addEventListener(Event.RemoteDuck, (...args) => console.log(args));
  TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, () => {
    // todo: 存储进度
  })

  
  
};
