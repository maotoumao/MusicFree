import {atom} from 'jotai';

/** 选中 */
const selectedIndicesAtom = atom<boolean[]>([]);

const editingMusicListAtom = atom<IMusic.IMusicItem[]>([]);

const musicListChangedAtom = atom(false);

export {selectedIndicesAtom, editingMusicListAtom, musicListChangedAtom};
