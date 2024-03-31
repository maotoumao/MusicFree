/**
 * 歌单管理
 */
import produce from 'immer';
import {useEffect, useState} from 'react';
import {nanoid} from 'nanoid';
import {isSameMediaItem, sortByTimestampAndIndex} from '@/utils/mediaItem';
import shuffle from 'lodash.shuffle';
import {GlobalState} from '@/utils/stateMapper';
import getOrCreateMMKV from '@/utils/getOrCreateMMKV';
import safeParse from '@/utils/safeParse';
import {InteractionManager} from 'react-native';
import safeStringify from '@/utils/safeStringify';
import {createMediaIndexMap} from '@/utils/mediaIndexMap';
import Config from './config';
import {getAppMeta, setAppMeta} from './appMeta';
import {getStorage as oldGetStorage} from '@/utils/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const defaultSheet: IMusic.IMusicSheetItemBase = {
    id: 'favorite',
    coverImg: undefined,
    title: '我喜欢',
};

let musicSheets = [defaultSheet];
let sheetMusicMap: Record<string, IMusic.IMusicItem[]> = {};

const favoriteMusicMapStore = new GlobalState<any>(null);

const sheetsCallBacks: Set<Function> = new Set([]);
function notifyMusicSheets() {
    sheetsCallBacks.forEach(cb => {
        cb();
    });
}
const getSheets = () => ({
    musicSheets,
    sheetMusicMap,
});

function getStorage(key: string) {
    const mmkv = getOrCreateMMKV(`LocalSheet.${key}`);

    return safeParse(mmkv.getString('data'));
}

async function setStorage(key: string, value: any) {
    return InteractionManager.runAfterInteractions(() => {
        const mmkv = getOrCreateMMKV(`LocalSheet.${key}`);
        mmkv.set('data', safeStringify(value));
    });
}

async function removeStorage(key: string) {
    const mmkv = getOrCreateMMKV(`LocalSheet.${key}`);
    mmkv.clearAll();
}

async function setup() {
    // 升级逻辑
    const dbUpdated = getAppMeta('MusicSheetVersion') === '1';
    try {
        async function getStorageWithMigrate(key: string) {
            if (dbUpdated) {
                return getStorage(key);
            } else {
                const oldResult = await oldGetStorage(key);
                setStorage(key, oldResult);
                AsyncStorage.removeItem(key);
                return oldResult;
            }
        }

        const _musicSheets: IMusic.IMusicSheetItemBase[] =
            await getStorageWithMigrate('music-sheets');

        if (!Array.isArray(_musicSheets)) {
            throw new Error('not exist');
        }

        for (let sheet of _musicSheets) {
            const musicList = await getStorageWithMigrate(sheet.id);
            sheetMusicMap = produce(sheetMusicMap, _ => {
                _[sheet.id] = musicList;
                return _;
            });
            if (sheet.id === 'favorite') {
                favoriteMusicMapStore.setValue(
                    createMediaIndexMap(musicList || []),
                );
            }
        }

        musicSheets = _musicSheets;
        setupStarredMusicSheets();
    } catch (e: any) {
        if (e.message === 'not exist') {
            await setStorage('music-sheets', [defaultSheet]);
            await setStorage(defaultSheet.id, []);
            musicSheets = [defaultSheet];
            sheetMusicMap[defaultSheet.id] = [];
        }
    }
    if (!dbUpdated) {
        setAppMeta('MusicSheetVersion', '1');
    }
    notifyMusicSheets();
}

async function updateAndSaveSheet(
    id: string,
    {
        basic,
        musicList,
    }: {
        basic?: Partial<IMusic.IMusicSheetItemBase>;
        musicList?: IMusic.IMusicItem[];
    },
) {
    const targetSheetIndex = musicSheets.findIndex(_ => _.id === id);
    if (targetSheetIndex === -1) {
        return;
    }
    if (basic) {
        const newMusicSheet = produce(musicSheets, draft => {
            draft[targetSheetIndex] = {
                ...draft[targetSheetIndex],
                ...basic,
                id,
            };
            return draft;
        });
        await setStorage('music-sheets', newMusicSheet);
        musicSheets = newMusicSheet;
    }
    if (musicList) {
        await setStorage(id, musicList);
        sheetMusicMap = produce(sheetMusicMap, _ => {
            _[id] = musicList;
        });

        // 默认歌单
        if (id === 'favorite' && musicList) {
            favoriteMusicMapStore.setValue(createMediaIndexMap(musicList));
        }
    }
    notifyMusicSheets();
}

async function addSheet(title: string) {
    const newId = nanoid();
    const newSheets: IMusic.IMusicSheetItemBase[] = [
        ...musicSheets,
        {
            title,
            id: newId,
            coverImg: undefined,
        },
    ];
    await setStorage('music-sheets', newSheets);
    await setStorage(newId, []);

    musicSheets = newSheets;
    sheetMusicMap = produce(sheetMusicMap, _ => {
        _[newId] = [];
    });
    notifyMusicSheets();
    return newId;
}

async function resumeSheets(
    sheets: ICommon.WithMusicList<IMusic.IMusicSheetItemBase>[],
    overwrite?: boolean,
) {
    let newSheets = overwrite ? [{...defaultSheet}] : [...musicSheets];
    let newSheetMusicMap: Record<string, IMusic.IMusicItem[]> = overwrite
        ? {}
        : {
              ...sheetMusicMap,
          };
    const needUpdatedIds = [];
    for (let i = 0; i < sheets.length; ++i) {
        const musicSheet = sheets[i];
        if (musicSheet.id === 'favorite') {
            needUpdatedIds.push('favorite');

            if (!overwrite) {
                const originalMusicList = sheetMusicMap[musicSheet.id] ?? [];
                const indexMap = createMediaIndexMap(originalMusicList);
                newSheetMusicMap[musicSheet.id] = originalMusicList.concat(
                    musicSheet.musicList?.filter(item => !indexMap.has(item)) ??
                        [],
                );
            } else {
                newSheetMusicMap[musicSheet.id] = [
                    ...(musicSheet.musicList || []),
                ];
            }
        } else {
            const newId = nanoid();
            needUpdatedIds.push(newId);

            newSheets = [
                ...newSheets,
                {
                    id: newId,
                    title: musicSheet.title,
                    coverImg: musicSheet.coverImg?.startsWith('http')
                        ? musicSheet.coverImg
                        : (musicSheet.musicList ?? [])[
                              (musicSheet.musicList?.length ?? 0) - 1
                          ]?.artwork,
                },
            ];
            newSheetMusicMap[newId] = musicSheet.musicList ?? [];
        }
    }
    await setStorage('music-sheets', newSheets);

    await Promise.all(
        needUpdatedIds.map(k => setStorage(k, newSheetMusicMap[k] ?? [])),
    );

    musicSheets = newSheets;
    sheetMusicMap = newSheetMusicMap;
    notifyMusicSheets();
}

async function removeSheet(sheetId: string) {
    if (sheetId !== 'favorite') {
        const newSheets = musicSheets.filter(item => item.id !== sheetId);
        removeStorage(sheetId);
        await setStorage('music-sheets', newSheets);
        musicSheets = newSheets;
        sheetMusicMap = produce(sheetMusicMap, _ => {
            _[sheetId] = [];
            delete _[sheetId];
        });
        notifyMusicSheets();
    }
}

async function addMusic(
    sheetId: string,
    musicItem: IMusic.IMusicItem | Array<IMusic.IMusicItem>,
) {
    if (!Array.isArray(musicItem)) {
        musicItem = [musicItem];
    }
    const musicList = sheetMusicMap[sheetId] ?? [];
    const indexMap = createMediaIndexMap(musicList);

    musicItem = musicItem.filter(item => !indexMap.has(item));
    // TODO: 改成MMKV
    const pendAtStart =
        Config.get('setting.basic.musicOrderInLocalSheet') === 'start';
    let newMusicList = [];
    if (pendAtStart) {
        newMusicList = musicItem.concat(musicList);
    } else {
        newMusicList = musicList.concat(musicItem);
    }
    let basic;
    if (
        !musicSheets
            .find(_ => _.id === sheetId)
            ?.coverImg?.startsWith('file://')
    ) {
        basic = {
            coverImg: newMusicList[newMusicList.length - 1]?.artwork,
        };
    }
    updateAndSaveSheet(sheetId, {
        basic: basic,
        musicList: newMusicList,
    });
}

async function removeMusicByIndex(sheetId: string, indices: number | number[]) {
    if (!Array.isArray(indices)) {
        indices = [indices];
    }
    const musicList = sheetMusicMap[sheetId] ?? [];
    const newMusicList = produce(musicList, draft => {
        draft = draft.filter((_, index) => {
            return !(indices as number[]).includes(index);
        });
        return draft;
    });
    updateAndSaveSheet(sheetId, {
        basic: {
            coverImg: newMusicList[newMusicList.length - 1]?.artwork,
        },
        musicList: newMusicList,
    });
}

async function removeMusic(
    sheetId: string,
    musicItems: IMusic.IMusicItem | IMusic.IMusicItem[],
) {
    if (!Array.isArray(musicItems)) {
        musicItems = [musicItems];
    }

    const musicList = sheetMusicMap[sheetId] ?? [];
    const indices = musicItems
        .map(musicItem =>
            musicList.findIndex(_ => isSameMediaItem(_, musicItem)),
        )
        .filter(_ => _ !== -1);
    await removeMusicByIndex(sheetId, indices);
}

function getSheetItems(): IMusic.IMusicSheetItem[] {
    let favIndex = -1;
    const result = produce(musicSheets as IMusic.IMusicSheetItem[], draft => {
        draft.forEach((_, index) => {
            if (_.id === defaultSheet.id) {
                favIndex = index;
            }
            _.musicList = sheetMusicMap[_.id] ?? [];
        });
    });

    if (favIndex === -1) {
        result.unshift({
            ...defaultSheet,
            musicList: [],
        });
    } else if (favIndex !== 0) {
        const favSheet = result.splice(favIndex, 1);
        result.unshift(favSheet[0]);
    }

    return result;
}

function sortMusicList(
    type:
        | undefined
        | 'a2z'
        | 'z2a'
        | 'random'
        | 'arta2z'
        | 'artz2a'
        | 'time'
        | 'time-rev',
    musicSheet: IMusic.IMusicSheetItem,
) {
    let musicList = [...(musicSheet.musicList ?? [])];
    if (type === 'a2z') {
        musicList.sort((a, b) => a.title.localeCompare(b.title));
    } else if (type === 'z2a') {
        musicList.sort((b, a) => a.title.localeCompare(b.title));
    } else if (type === 'random') {
        musicList = shuffle(musicList);
    } else if (type === 'arta2z') {
        musicList.sort((a, b) => a.artist?.localeCompare?.(b.artist));
    } else if (type === 'artz2a') {
        musicList.sort((b, a) => a.artist?.localeCompare?.(b.artist));
    } else if (type === 'time') {
        sortByTimestampAndIndex(musicList);
        musicList.reverse();
    } else if (type === 'time-rev') {
        sortByTimestampAndIndex(musicList);
    }

    updateAndSaveSheet(musicSheet.id, {
        musicList: type ? musicList : undefined,
    });
}

function useSheets(): IMusic.IMusicSheet;
function useSheets(sheetId: string): IMusic.IMusicSheetItem;
function useSheets(sheetId?: string) {
    const [_musicSheets, _setMusicSheets] =
        useState<IMusic.IMusicSheetItem[]>(getSheetItems);

    const _notifyCb = () => {
        _setMusicSheets(getSheetItems());
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

const starredMusicSheetsStore = new GlobalState<IMusic.IMusicSheetItem[]>([]);

async function setupStarredMusicSheets() {
    const starredSheets: IMusic.IMusicSheetItem[] =
        (await getStorage('starred-sheets')) || [];
    starredMusicSheetsStore.setValue(starredSheets);
}

async function starMusicSheet(musicSheet: IMusic.IMusicSheetItem) {
    const newVal = [...starredMusicSheetsStore.getValue(), musicSheet];

    starredMusicSheetsStore.setValue(newVal);
    await setStorage('starred-sheets', newVal);
}

async function unstarMusicSheet(musicSheet: IMusic.IMusicSheetItem) {
    const newVal = starredMusicSheetsStore
        .getValue()
        .filter(it => it.id !== musicSheet.id);
    starredMusicSheetsStore.setValue(newVal);
    await setStorage('starred-sheets', newVal);
}

function useSheetStarred(
    musicSheet: IMusic.IMusicSheetItem | null | undefined,
) {
    // TODO: 类型有问题
    const [starred, setStarred] = useState(
        starredMusicSheetsStore
            .getValue()
            .findIndex(it => isSameMediaItem(musicSheet as any, it as any)) !==
            -1,
    );
    const allStarredSheet = starredMusicSheetsStore.useValue();

    useEffect(() => {
        setStarred(
            allStarredSheet.findIndex(it =>
                isSameMediaItem(musicSheet as any, it as any),
            ) !== -1,
        );
    }, [allStarredSheet]);

    return starred;
}

/** 是否添加到我喜欢歌单 */
function useMusicFavIndex(musicItem: IMusic.IMusicItem | null) {
    const indexMap = favoriteMusicMapStore.useValue();

    if (!musicItem) {
        return -1;
    }

    return indexMap?.getIndex?.(musicItem) ?? -1;
}

const MusicSheet = {
    setup,
    addSheet,
    defaultSheet,
    addMusic,
    getSheets,
    useSheets,
    removeSheet,
    resumeSheets,
    removeMusicByIndex,
    updateAndSaveSheet,
    removeMusic,
    useUserSheets,
    sortMusicList,
    starMusicSheet,
    unstarMusicSheet,
    useStarredMusicSheet: starredMusicSheetsStore.useValue,
    useSheetStarred,
    useMusicFavIndex,
};

export default MusicSheet;
