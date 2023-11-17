/**
 * 管理当前歌曲的歌词
 */

import {isSameMediaItem} from '@/utils/mediaItem';
import MusicQueue from './musicQueue';
import PluginManager from './pluginManager';
import LyricParser from '@/utils/lrcParser';
import {GlobalState} from '@/utils/stateMapper';
import {EDeviceEvents} from '@/constants/commonConst';
import {DeviceEventEmitter} from 'react-native';
import Config from './config';
import LyricUtil from '@/native/lyricUtil';

const lyricStateStore = new GlobalState<{
    loading: boolean;
    lyricParser?: LyricParser;
    lyrics: ILyric.IParsedLrc;
    meta?: Record<string, string>;
}>({
    loading: true,
    lyrics: [],
});

const currentLyricStore = new GlobalState<ILyric.IParsedLrcItem | null>(null);

// 重新获取歌词
async function refreshLyric(fromStart?: boolean) {
    const musicItem = MusicQueue.getCurrentMusicItem();
    try {
        lyricStateStore.setValue({
            loading: true,
            lyrics: [],
        });
        currentLyricStore.setValue(null);

        const lrc = await PluginManager.getByMedia(
            musicItem,
        )?.methods?.getLyricText(musicItem);
        const realtimeMusicItem = MusicQueue.getCurrentMusicItem();
        if (isSameMediaItem(musicItem, realtimeMusicItem)) {
            if (lrc) {
                const parser = new LyricParser(lrc, musicItem);
                lyricStateStore.setValue({
                    loading: false,
                    lyricParser: parser,
                    lyrics: parser.getLyric(),
                    meta: parser.getMeta(),
                });
                // 更新当前状态的歌词
                const currentLyric = fromStart
                    ? parser.getLyric()[0]
                    : parser.getPosition(await MusicQueue.getPosition()).lrc;
                currentLyricStore.setValue(currentLyric || null);
            } else {
                // 没有歌词
                lyricStateStore.setValue({
                    loading: false,
                    lyrics: [],
                });
            }
        }
    } catch {
        const realtimeMusicItem = MusicQueue.getCurrentMusicItem();
        if (isSameMediaItem(musicItem, realtimeMusicItem)) {
            // 异常情况
            lyricStateStore.setValue({
                loading: false,
                lyrics: [],
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
};

export default LyricManager;
