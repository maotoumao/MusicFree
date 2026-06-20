import { getDefaultStore } from "jotai";
import { editingMusicListAtom, musicListChangedAtom } from "./atom";
import { localMusicSheetId, musicHistorySheetId } from "@/constants/commonConst";
import LocalMusicSheet from "@/core/localMusicSheet";
import musicHistory from "@/core/musicHistory";
import MusicSheet from "@/core/musicSheet";

export async function saveEditingMusicList(musicSheetId?: string) {
    if (!musicSheetId) {
        return;
    }
    const isDirty = getDefaultStore().get(musicListChangedAtom);
    if (!isDirty) {
        return;
    }
    const editingMusicList = getDefaultStore().get(editingMusicListAtom);
    const musicItems = editingMusicList.map(it => it.musicItem);

    if (musicSheetId === localMusicSheetId) {
        await LocalMusicSheet.updateMusicList(musicItems);
    } else if (musicSheetId === musicHistorySheetId) {
        await musicHistory.setHistory(musicItems);
    } else {
        await MusicSheet.manualSort(musicSheetId, musicItems);
    }

    getDefaultStore().set(musicListChangedAtom, false);
}