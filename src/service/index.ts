import Config from '@/core/config';
import musicIsPaused from '@/utils/musicIsPaused';
import TrackPlayer, {Event, State} from 'react-native-track-player';
import MusicQueue from '../core/musicQueue';

let resumeState: State;
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
            if (paused) {
                resumeState = await TrackPlayer.getState();
                return MusicQueue.pause();
            } else if (!musicIsPaused(resumeState)) {
                return MusicQueue.play();
            }
        },
    );
    TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, evt => {
        Config.set('status.music.progress', evt.position);
    });
    /** 播放下一个 */
    TrackPlayer.addEventListener(Event.PlaybackTrackChanged, async evt => {
        // 是track里的，不是playlist里的
        if (
            evt.nextTrack === 1 &&
            !(await TrackPlayer.getTrack(evt.nextTrack))?.url
        ) {
            if (MusicQueue.getRepeatMode() === 'SINGLE') {
                await MusicQueue.play(undefined, true);
            } else {
                console.log('SKIP');
                await MusicQueue.skipToNext();
            }
        }
    });
};
