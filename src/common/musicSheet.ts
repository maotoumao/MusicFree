/**
 * 歌单管理
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import produce from 'immer';
import {useEffect, useState} from 'react';
import {nanoid} from 'nanoid';
import {ToastAndroid} from 'react-native';
import isSameMusicItem from '@/utils/isSameMusicItem';

const defaultSheet: IMusic.IMusicSheetItem = {
  id: 'favorite',
  coverImg: undefined,
  title: '我喜欢',
  musicList: [],
};

let musicSheets: IMusic.IMusicSheet = [defaultSheet];

const sheetsCallBacks: Set<Function> = new Set([]);
function notifyMusicSheets() {
  sheetsCallBacks.forEach(cb => {
    cb();
  });
}

async function saveSheets(sheets: IMusic.IMusicSheet) {
  await AsyncStorage.setItem('music-sheets', JSON.stringify(sheets));
}

async function loadSheets(): Promise<IMusic.IMusicSheet> {
  const _ = await AsyncStorage.getItem('music-sheets');
  return _ ? JSON.parse(_) : new Error();
}

async function initMusicSheet() {
  try {
    const _musicSheets = await loadSheets();
    if (!Array.isArray(_musicSheets)) {
      throw new Error();
    }
    musicSheets = _musicSheets;
  } catch {
    await saveSheets([defaultSheet]);
  }
  notifyMusicSheets();
}

async function addSheet(title: string) {
  const newSheets: IMusic.IMusicSheet = [
    ...musicSheets,
    {
      title,
      id: nanoid(),
      musicList: [],
      coverImg: undefined,
    },
  ];
  await saveSheets(newSheets);
  musicSheets = newSheets;
  notifyMusicSheets();
}

async function updateSheet(
  sheetId: string,
  props: {coverImg?: string; title?: string},
) {
  const sheetIndex = musicSheets.findIndex(sheet => sheet.id === sheetId);
  if (sheetIndex === -1) return;
  const newSheets = produce(musicSheets, draft => {
    if (props.coverImg) {
      draft[sheetIndex].coverImg = props.coverImg;
    }
    if (props.title && sheetId !== 'favorite') {
      draft[sheetIndex].title = props.title;
    }
  });
  await saveSheets(newSheets);
  notifyMusicSheets();
}

async function removeSheet(sheetId: string) {
  if (sheetId !== 'favorite') {
    const newSheets = musicSheets.filter(item => item.id !== sheetId);
    await saveSheets(newSheets);
    musicSheets = newSheets;
    notifyMusicSheets();
  }
}

async function addMusic(
  sheetId: string,
  musicItem: IMusic.IMusicItem | Array<IMusic.IMusicItem>,
) {
  console.log('mmm', musicItem);
  const sheetIndex = musicSheets.findIndex(sheet => sheet.id === sheetId);
  if (sheetIndex === -1) return;
  if (!Array.isArray(musicItem)) {
    musicItem = [musicItem];
  }
  musicItem = musicItem.filter(
    item =>
      musicSheets[sheetIndex].musicList.findIndex(_ =>
        isSameMusicItem(_, item),
      ) === -1,
  );
  const newSheets = produce(musicSheets, draft => {
    const _sheet = draft[sheetIndex];
    _sheet.musicList = _sheet.musicList.concat(musicItem);
    _sheet.coverImg = (musicItem as Array<IMusic.IMusicItem>)[
      musicItem.length - 1
    ].artwork;
    draft[sheetIndex] = _sheet;
    return draft;
  });
  await saveSheets(newSheets);
  musicSheets = newSheets;
  notifyMusicSheets();
}

async function removeMusicByIndex(sheetId: string, indices: number | number[]) {
  const sheetIndex = musicSheets.findIndex(sheet => sheet.id === sheetId);
  if (sheetIndex === -1) return;
  if (!Array.isArray(indices)) {
    indices = [indices];
  }
  const newSheets = produce(musicSheets, draft => {
    const _sheet = draft[sheetIndex];
    _sheet.musicList = _sheet.musicList.filter((_, index) => {
      return !(indices as number[]).includes(index);
    });
    _sheet.coverImg = _sheet.musicList[_sheet.musicList.length - 1]?.artwork;
    draft[sheetIndex] = _sheet;
    return draft;
  });
  await saveSheets(newSheets);
  musicSheets = newSheets;
  notifyMusicSheets();
}

async function removeMusic(
  sheetId: string,
  musicItems: IMusic.IMusicItem | IMusic.IMusicItem[],
) {
  const sheet = musicSheets.find(sheet => sheet.id === sheetId);
  if (!sheet) return;
  if (!Array.isArray(musicItems)) {
    musicItems = [musicItems];
  }
  const indices = musicItems
    .map(musicItem =>
      sheet.musicList.findIndex(_ => isSameMusicItem(_, musicItem)),
    )
    .filter(_ => _ !== -1);
  await removeMusicByIndex(sheetId, indices);
}

function useSheets(): IMusic.IMusicSheet;
function useSheets(sheetId: string): IMusic.IMusicSheetItem;
function useSheets(sheetId?: string) {
  const [_musicSheets, _setMusicSheets] = useState(musicSheets);

  const _notifyCb = () => {
    _setMusicSheets(musicSheets);
  };

  useEffect(() => {
    sheetsCallBacks.add(_notifyCb);
    return () => {
      sheetsCallBacks.delete(_notifyCb);
    };
  }, []);
  return sheetId ? _musicSheets?.find(_ => _.id === sheetId) : _musicSheets;
}

function useUserSheets(): IMusic.IMusicSheet {
  const sheets = useSheets();
  return sheets?.filter(_ => _.id !== 'favorite') ?? [];
}

const MusicSheet = {
  initMusicSheet,
  addSheet,
  updateSheet,
  addMusic,
  useSheets,
  removeSheet,
  removeMusicByIndex,
  removeMusic,
  useUserSheets,
};
// useUserSheets,

export default MusicSheet;
