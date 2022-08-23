import { setConfig } from '@/common/localConfigManager';
import TrackPlayer, {Event} from 'react-native-track-player';
import MusicQueue from '../common/musicQueue';

module.exports = async function () {

  TrackPlayer.addEventListener(Event.RemotePlay, () => MusicQueue.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => MusicQueue.pause());
  TrackPlayer.addEventListener(Event.RemotePrevious, () => MusicQueue.skipToPrevious());
  TrackPlayer.addEventListener(Event.RemoteNext, () => MusicQueue.skipToNext());
  TrackPlayer.addEventListener(Event.RemoteDuck, async ({paused, parmanent}) => {
    if(parmanent) {
      return MusicQueue.pause();
    }
    if(paused) {
      return MusicQueue.pause();
    } else {
      return MusicQueue.play();
    }
  });
  TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, (evt) => {
    setConfig('status.music.progress', evt.position);
  })

  
  
};
