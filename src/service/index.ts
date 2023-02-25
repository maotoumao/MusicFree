import Config from '@/core/config';
import musicIsPaused from '@/utils/musicIsPaused';
import TrackPlayer, {Event, State} from 'react-native-track-player';
import MusicQueue from '../core/musicQueue';

let resumeState: State | null;
module.exports = async function () {
    TrackPlayer.addEventListener(Event.RemotePlay, () => MusicQueue.play());
    TrackPlayer.addEventListener(Event.RemotePause, () => MusicQueue.pause());
    TrackPlayer.addEventListener(Event.RemotePrevious, () =>
        MusicQueue.skipToPrevious(),
    );
    TrackPlayer.addEventListener(Event.RemoteNext, () =>
        MusicQueue.skipToNext(),
    );
    TrackPlayer.addEventListener(
        Event.RemoteDuck,
        async ({paused, permanent}) => {
            if (Config.get('setting.basic.notInterrupt')) {
                return;
            }
            if (permanent) {
                return MusicQueue.pause();
            }
            const tempRemoteDuckConf = Config.get(
                'setting.basic.tempRemoteDuck',
            );
            if (tempRemoteDuckConf === '降低音量') {
                if (paused) {
                    return TrackPlayer.setVolume(0.5);
                } else {
                    return TrackPlayer.setVolume(1);
                }
            } else {
                if (paused) {
                    resumeState = await TrackPlayer.getState();
                    return MusicQueue.pause();
                } else {
                    if (resumeState && !musicIsPaused(resumeState)) {
                        resumeState = null;
                        return MusicQueue.play();
                    }
                    resumeState = null;
                }
            }
        },
    );
    TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, evt => {
        Config.set('status.music.progress', evt.position, false);
    });
};
