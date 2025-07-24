import { musicHistorySheetId } from "@/constants/commonConst";
import { isSameMediaItem } from "@/utils/mediaUtils";
import { getStorage, setStorage } from "@/utils/storage";
import { atom, getDefaultStore, useAtomValue } from "jotai";

import type { IAppConfig } from "@/types/core/config";
import type { IMusicHistory } from "@/types/core/musicHistory.js";
import type { IInjectable } from "@/types/infra";


const musicHistoryAtom = atom<IMusic.IMusicItem[]>([]);

class MusicHistory implements IMusicHistory, IInjectable {
    private configService!: IAppConfig;

    injectDependencies(configService: IAppConfig): void {
        this.configService = configService;
    }

    get history() {
        return getDefaultStore().get(musicHistoryAtom);
    }

    async setup() {
        const history = await getStorage(musicHistorySheetId);
        getDefaultStore().set(musicHistoryAtom, history ?? []);
    }

    async addMusic(musicItem: IMusic.IMusicItem) {
        const newMusicHistory = [
            musicItem,
            ...this.history
                .filter(item => !isSameMediaItem(item, musicItem)),
        ].slice(0, this.configService.getConfig("basic.maxHistoryLen") ?? 50);
        await setStorage(musicHistorySheetId, newMusicHistory);

        getDefaultStore().set(musicHistoryAtom, newMusicHistory);
    }

    async removeMusic(musicItem: IMusic.IMusicItem) {
        const newMusicHistory = this.history
            .filter(item => !isSameMediaItem(item, musicItem));
        await setStorage(musicHistorySheetId, newMusicHistory);

        getDefaultStore().set(musicHistoryAtom, newMusicHistory);
    }

    async clearMusic() {
        await setStorage(musicHistorySheetId, []);
        getDefaultStore().set(musicHistoryAtom, []);
    }

    async setHistory(newHistory: IMusic.IMusicItem[]) {
        await setStorage(musicHistorySheetId, newHistory);
        getDefaultStore().set(musicHistoryAtom, newHistory);
    }
}


export function useMusicHistory() {
    return useAtomValue(musicHistoryAtom);
}

const musicHistory = new MusicHistory();
export default musicHistory;

