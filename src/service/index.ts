import Config from '@/core/config';
import RNTrackPlayer, {Event, State} from 'react-native-track-player';
import LyricManager from '@/core/lyricManager';
import LyricUtil from '@/native/lyricUtil';
import TrackPlayer from '@/core/trackPlayer';
import {musicIsPaused} from '@/utils/trackUtils';
import PersistStatus from '@/core/persistStatus';

let resumeState: State | null;
module.exports = async function () {
    RNTrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
    RNTrackPlayer.addEventListener(Event.RemotePause, () =>
        TrackPlayer.pause(),
    );
    RNTrackPlayer.addEventListener(Event.RemotePrevious, () =>
        TrackPlayer.skipToPrevious(),
    );
    RNTrackPlayer.addEventListener(Event.RemoteNext, () =>
        TrackPlayer.skipToNext(),
    );
    RNTrackPlayer.addEventListener(
        Event.RemoteDuck,
        async ({paused, permanent}) => {
            if (Config.get('setting.basic.notInterrupt')) {
                return;
            }
            if (permanent) {
                return TrackPlayer.pause();
            }
            const tempRemoteDuckConf = Config.get(
                'setting.basic.tempRemoteDuck',
            );
            if (tempRemoteDuckConf === '降低音量') {
                if (paused) {
                    return RNTrackPlayer.setVolume(0.5);
                } else {
                    return RNTrackPlayer.setVolume(1);
                }
            } else {
                if (paused) {
                    resumeState =
                        (await RNTrackPlayer.getPlaybackState()).state ??
                        State.Paused;
                    return TrackPlayer.pause();
                } else {
                    if (resumeState && !musicIsPaused(resumeState)) {
                        resumeState = null;
                        return TrackPlayer.play();
                    }
                    resumeState = null;
                }
            }
        },
    );

    RNTrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, () => {
        const currentMusicItem = TrackPlayer.getCurrentMusic();
        if (currentMusicItem) {
            LyricUtil.setStatusBarLyricText(
                `${currentMusicItem.title} - ${currentMusicItem.artist}`,
            );
        }
    });

    RNTrackPlayer.addEventListener(Event.PlaybackProgressUpdated, evt => {
        PersistStatus.set('music.progress', evt.position);

        // 歌词逻辑
        const parser = LyricManager.getLyricState().lyricParser;
        if (parser) {
            const prevLyricText = LyricManager.getCurrentLyric()?.lrc;
            const currentLyricItem = parser.getPosition(evt.position);
            if (prevLyricText !== currentLyricItem?.lrc) {
                LyricManager.setCurrentLyric(currentLyricItem ?? null);
                const showTranslation = PersistStatus.get(
                    'lyric.showTranslation',
                );
                if (Config.get('setting.lyric.showStatusBarLyric')) {
                    LyricUtil.setStatusBarLyricText(
                        (currentLyricItem?.lrc ?? '') +
                            (showTranslation
                                ? `\n${currentLyricItem?.translation ?? ''}`
                                : ''),
                    );
                }
            }
        }
    });

    RNTrackPlayer.addEventListener(Event.RemoteStop, async () => {
        RNTrackPlayer.stop();
    });

    RNTrackPlayer.addEventListener(Event.RemoteSeek, async evt => {
        TrackPlayer.seekTo(evt.position);
    });
};
