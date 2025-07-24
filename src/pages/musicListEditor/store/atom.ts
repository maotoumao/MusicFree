import { atom } from "jotai";

export interface IEditorMusicItem {
    musicItem: IMusic.IMusicItem;
    checked?: boolean;
}

/** 编辑页中的音乐条目 */
const editingMusicListAtom = atom<IEditorMusicItem[]>([]);

/** 是否变动过 */
const musicListChangedAtom = atom(false);

export { editingMusicListAtom, musicListChangedAtom };
