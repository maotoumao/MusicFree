import {atom} from 'jotai';
import SortedMusicList from '@/core/musicSheet/sortedMusicList.ts';

export const musicSheetsBaseAtom = atom<IMusic.IMusicSheetItemBase[]>([]);

export const starredMusicSheetsAtom = atom<IMusic.IMusicSheetItem[]>([]);

// key: sheetId, value: musicList
export const musicListMap = new Map<string, SortedMusicList>();
