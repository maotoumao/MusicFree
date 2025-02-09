import { isSameMediaItem } from "@/utils/mediaItem";
import { GlobalState } from "@/utils/stateMapper";
import { getStorage, setStorage } from "@/utils/storage";
import Config from "./config.ts";
import { musicHistorySheetId } from "@/constants/commonConst";

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
    ].slice(0, Config.getConfig('basic.maxHistoryLen') ?? 50);
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

async function setHistory(newHistory: IMusic.IMusicItem[]) {
    await setStorage(musicHistorySheetId, newHistory);
    musicHistory.setValue(newHistory);
}

export default {
    setupMusicHistory,
    addMusic,
    removeMusic,
    clearMusic,
    setHistory,
    useMusicHistory: musicHistory.useValue,
};
