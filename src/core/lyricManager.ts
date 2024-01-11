/**
 * 管理当前歌曲的歌词
 */

import {isSameMediaItem} from '@/utils/mediaItem';
import PluginManager from './pluginManager';
import LyricParser from '@/utils/lrcParser';
import {GlobalState} from '@/utils/stateMapper';
import {EDeviceEvents} from '@/constants/commonConst';
import {DeviceEventEmitter} from 'react-native';
import Config from './config';
import LyricUtil from '@/native/lyricUtil';
import TrackPlayer from './trackPlayer';
import MediaExtra from './mediaExtra';

const lyricStateStore = new GlobalState<{
    loading: boolean;
    lyricParser?: LyricParser;
    lyrics: ILyric.IParsedLrc;
    translationLyrics?: ILyric.IParsedLrc;
    meta?: Record<string, string>;
    hasTranslation: boolean;
}>({
    loading: true,
    lyrics: [],
    hasTranslation: false,
});

const currentLyricStore = new GlobalState<ILyric.IParsedLrcItem | null>(null);

// 重新获取歌词
async function refreshLyric(fromStart?: boolean, forceRequest = false) {
    const musicItem = TrackPlayer.getCurrentMusic();
    try {
        if (!musicItem) {
            lyricStateStore.setValue({
                loading: false,
                lyrics: [],
                hasTranslation: false,
            });

            currentLyricStore.setValue({
                lrc: 'MusicFree',
                time: 0,
            });

            return;
        }

        const currentParserMusicItem = lyricStateStore
            .getValue()
            ?.lyricParser?.getCurrentMusicItem();

        let lrcSource: ILyric.ILyricSource | null | undefined;
        if (
            forceRequest ||
            !isSameMediaItem(currentParserMusicItem, musicItem)
        ) {
            lyricStateStore.setValue({
                loading: true,
                lyrics: [],
                hasTranslation: false,
            });
            currentLyricStore.setValue(null);

            lrcSource = await PluginManager.getByMedia(
                musicItem,
            )?.methods?.getLyric(musicItem);
        } else {
            lrcSource = lyricStateStore.getValue().lyricParser!.lrcSource;
        }

        const realtimeMusicItem = TrackPlayer.getCurrentMusic();
        if (isSameMediaItem(musicItem, realtimeMusicItem)) {
            if (lrcSource) {
                const mediaExtra = MediaExtra.get(musicItem);
                const parser = new LyricParser(lrcSource, musicItem, {
                    offset: (mediaExtra?.lyricOffset || 0) * -1,
                });

                lyricStateStore.setValue({
                    loading: false,
                    lyricParser: parser,
                    lyrics: parser.getLyric(),
                    translationLyrics: lrcSource.translation
                        ? parser.getTranslationLyric()
                        : undefined,
                    meta: parser.getMeta(),
                    hasTranslation: !!lrcSource.translation,
                });
                // 更新当前状态的歌词
                const currentLyric = fromStart
                    ? parser.getLyric()[0]
                    : parser.getPosition(
                          (await TrackPlayer.getProgress()).position,
                      ).lrc;
                currentLyricStore.setValue(currentLyric || null);
            } else {
                // 没有歌词
                lyricStateStore.setValue({
                    loading: false,
                    lyrics: [],
                    hasTranslation: false,
                });
            }
        }
    } catch (e) {
        console.log(e, 'LRC');
        const realtimeMusicItem = TrackPlayer.getCurrentMusic();
        if (isSameMediaItem(musicItem, realtimeMusicItem)) {
            // 异常情况
            lyricStateStore.setValue({
                loading: false,
                lyrics: [],
                hasTranslation: false,
            });
        }
    }
}

// 获取歌词
async function setup() {
    DeviceEventEmitter.addListener(EDeviceEvents.REFRESH_LYRIC, refreshLyric);

    if (Config.get('setting.lyric.showStatusBarLyric')) {
        LyricUtil.showStatusBarLyric(
            'MusicFree',
            Config.get('setting.lyric') ?? {},
        );
    }

    refreshLyric();
}

const LyricManager = {
    setup,
    useLyricState: lyricStateStore.useValue,
    getLyricState: lyricStateStore.getValue,
    useCurrentLyric: currentLyricStore.useValue,
    getCurrentLyric: currentLyricStore.getValue,
    setCurrentLyric: currentLyricStore.setValue,
    refreshLyric,
};

export default LyricManager;
