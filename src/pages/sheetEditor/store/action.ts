import { getDefaultStore } from "jotai";
import { editingMusicSheetAtom, musicSheetChangedAtom, sheetTypeAtom } from "./atom";
import MusicSheet from "@/core/musicSheet";


export function saveEditingMusicSheet() {
    const isDirty = getDefaultStore().get(musicSheetChangedAtom);
    if (!isDirty) {
        return;
    }

    const editingSheets = getDefaultStore().get(editingMusicSheetAtom).map(it => it.musicSheetItem);

    const currentTab = getDefaultStore().get(sheetTypeAtom);
    if (currentTab === "starred") {
        MusicSheet.setStarredMusicSheets(editingSheets as IMusic.IMusicSheetItem[]);
    } else {
        MusicSheet.setSortedSheets(editingSheets);
    }
    getDefaultStore().set(musicSheetChangedAtom, false);

}