/**
 * 歌单管理
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import produce from 'immer';
import {useEffect, useState} from 'react';
import {nanoid} from 'nanoid';
import {getStorage, setStorage} from '@/utils/storage';
import {isSameMediaItem} from '@/utils/mediaItem';

const defaultSheet: IMusic.IMusicSheetItemBase = {
    id: 'favorite',
    coverImg: undefined,
    title: '我喜欢',
};

let musicSheets = [defaultSheet];
let sheetMusicMap: Record<string, IMusic.IMusicItem[]> = {};

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

async function setup() {
    try {
        const _musicSheets: IMusic.IMusicSheetItemBase[] = await getStorage(
            'music-sheets',
        );
        if (!Array.isArray(_musicSheets)) {
            throw new Error('not exist');
        }
        for (let sheet of _musicSheets) {
            const musicList = await getStorage(sheet.id);
            sheetMusicMap = produce(sheetMusicMap, _ => {
                _[sheet.id] = musicList;
                return _;
            });
        }
        musicSheets = _musicSheets;
    } catch (e: any) {
        if (e.message === 'not exist') {
            await setStorage('music-sheets', [defaultSheet]);
            await setStorage(defaultSheet.id, []);
            musicSheets = [defaultSheet];
            sheetMusicMap[defaultSheet.id] = [];
        }
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
) {
    let newSheets = [...musicSheets];
    let newSheetMusicMap: Record<string, IMusic.IMusicItem[]> = {
        ...sheetMusicMap,
    };
    const needUpdatedIds = [];
    for (let i = 0; i < sheets.length; ++i) {
        const musicSheet = sheets[i];
        if (musicSheet.id === 'favorite') {
            needUpdatedIds.push('favorite');
            const originalMusicList = sheetMusicMap[musicSheet.id] ?? [];
            newSheetMusicMap[musicSheet.id] = originalMusicList.concat(
                musicSheet.musicList?.filter(
                    item =>
                        originalMusicList.findIndex(_ =>
                            isSameMediaItem(_, item),
                        ) === -1,
                ) ?? [],
            );
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
        await AsyncStorage.removeItem(sheetId);
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
    musicItem = musicItem.filter(
        item => musicList.findIndex(_ => isSameMediaItem(_, item)) === -1,
    );
    const newMusicList = musicList.concat(musicItem);
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
    notifyMusicSheets();
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
    notifyMusicSheets();
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
    return produce(musicSheets as IMusic.IMusicSheetItem[], draft => {
        draft.forEach(_ => {
            _.musicList = sheetMusicMap[_.id] ?? [];
        });
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

const MusicSheet = {
    setup,
    addSheet,
    addMusic,
    getSheets,
    useSheets,
    removeSheet,
    resumeSheets,
    removeMusicByIndex,
    updateAndSaveSheet,
    removeMusic,
    useUserSheets,
};

export default MusicSheet;
