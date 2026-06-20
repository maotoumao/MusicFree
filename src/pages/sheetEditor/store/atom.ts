import { atom } from "jotai";

export interface IEditorMusicSheetItem {
    musicSheetItem: IMusic.IMusicSheetItemBase;
    checked?: boolean;
}

/** 编辑页中的音乐条目 */
const editingMusicSheetAtom = atom<IEditorMusicSheetItem[]>([]);

/** 是否变动过 */
const musicSheetChangedAtom = atom(false);

/** 本地歌单还是收藏歌单 */
const sheetTypeAtom = atom<"local" | "starred">("local");

export { editingMusicSheetAtom, musicSheetChangedAtom, sheetTypeAtom };
