import Config from '@/core/config';
import musicIsPaused from '@/utils/musicIsPaused';
import TrackPlayer, {Event, State} from 'react-native-track-player';
import MusicQueue from '../core/musicQueue';
import LyricManager from '@/core/lyricManager';
import LyricUtil from '@/native/lyricUtil';

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

    TrackPlayer.addEventListener(Event.PlaybackTrackChanged, () => {
        const currentMusicItem = MusicQueue.getCurrentMusicItem();
        if (currentMusicItem) {
            LyricUtil.setStatusBarLyricText(
                `${currentMusicItem.title} - ${currentMusicItem.artist}`,
            );
        }
    });

    TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, evt => {
        Config.set('status.music.progress', evt.position, false);

        // 歌词逻辑
        const parser = LyricManager.getLyricState().lyricParser;
        if (parser) {
            const prevLyricText = LyricManager.getCurrentLyric()?.lrc;
            const currentLyricItem = parser.getPosition(evt.position).lrc;
            if (prevLyricText !== currentLyricItem?.lrc) {
                LyricManager.setCurrentLyric(currentLyricItem ?? null);

                if (Config.get('setting.lyric.showStatusBarLyric')) {
                    LyricUtil.setStatusBarLyricText(
                        currentLyricItem?.lrc ?? '',
                    );
                }
            }
        }
    });
};
