import {atomWithStorage} from 'jotai/utils';
import storage from './storage';

// 歌单配置
interface IMusicSheetState {
  favorite: IMusic.IMusicSheet;
  mySheets: IMusic.IMusicSheet;
  local: IMusic.IMusicSheet;
}

const musicSheetsState: IMusicSheetState = {
  favorite: [],
  mySheets: [],
  local: [],
};

const musicSheetsStateAtom = atomWithStorage<typeof musicSheetsState>(
  'music-sheets',
  musicSheetsState,
  storage,
);

export {musicSheetsStateAtom};
