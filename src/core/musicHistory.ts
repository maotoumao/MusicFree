import {isSameMediaItem} from '@/utils/mediaItem';
import {GlobalState} from '@/utils/stateMapper';
import {getStorage, setStorage} from '@/utils/storage';
import Config from './config';
import {musicHistorySheetId} from '@/constants/commonConst';

const musicHistory = new GlobalState<IMusic.IMusicItem[]>([]);

async function setupMusicHistory() {
    const history = await getStorage(musicHistorySheetId);
    musicHistory.setValue(history ?? []);
}

async function addMusic(musicItem: IMusic.IMusicItem) {
    const newMusicHistory = [
        musicItem,
        ...musicHistory
            .getValue()
            .filter(item => !isSameMediaItem(item, musicItem)),
    ].slice(0, Config.get('setting.basic.maxHistoryLen') ?? 50);
    await setStorage(musicHistorySheetId, newMusicHistory);
    musicHistory.setValue(newMusicHistory);
}

async function removeMusic(musicItem: IMusic.IMusicItem) {
    const newMusicHistory = musicHistory
        .getValue()
        .filter(item => !isSameMediaItem(item, musicItem));
    await setStorage(musicHistorySheetId, newMusicHistory);
    musicHistory.setValue(newMusicHistory);
}

async function clearMusic() {
    await setStorage(musicHistorySheetId, []);
    musicHistory.setValue([]);
}

export default {
    setupMusicHistory,
    addMusic,
    removeMusic,
    clearMusic,
    useMusicHistory: musicHistory.useValue,
};
