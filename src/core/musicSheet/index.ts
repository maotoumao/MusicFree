/**
 * 歌单管理
 */
import {Immer} from 'immer';
import {useEffect, useMemo, useState} from 'react';
import {nanoid} from 'nanoid';
import {isSameMediaItem} from '@/utils/mediaItem';
import storage from '@/core/musicSheet/storage.ts';
import migrate, {migrateV2} from '@/core/musicSheet/migrate.ts';
import {getDefaultStore, useAtomValue} from 'jotai';
import {
    musicListMap,
    musicSheetsBaseAtom,
    starredMusicSheetsAtom,
} from '@/core/musicSheet/atoms.ts';
import {ResumeMode, SortType} from '@/constants/commonConst.ts';
import SortedMusicList from '@/core/musicSheet/sortedMusicList.ts';
import ee from '@/core/musicSheet/ee.ts';
import Config from '@/core/config.ts';

const produce = new Immer({
    autoFreeze: false,
}).produce;

const defaultSheet: IMusic.IMusicSheetItemBase = {
    id: 'favorite',
    coverImg: undefined,
    title: '我喜欢',
    worksNum: 0,
};

async function setup() {
    // 升级逻辑 - 从 AsyncStorage 升级到 MMKV
    await migrate();
    try {
        const allSheets: IMusic.IMusicSheetItemBase[] = storage.getSheets();

        if (!Array.isArray(allSheets)) {
            throw new Error('not exist');
        }

        let needRestore = false;
        if (!allSheets.length) {
            allSheets.push({
                ...defaultSheet,
            });
            needRestore = true;
        }
        if (allSheets[0].id !== defaultSheet.id) {
            const defaultSheetIndex = allSheets.findIndex(
                it => it.id === defaultSheet.id,
            );

            if (defaultSheetIndex === -1) {
                allSheets.unshift({
                    ...defaultSheet,
                });
            } else {
                const firstSheet = allSheets.splice(defaultSheetIndex, 1);
                allSheets.unshift(firstSheet[0]);
            }
            needRestore = true;
        }

        if (needRestore) {
            await storage.setSheets(allSheets);
        }

        for (let sheet of allSheets) {
            const musicList = storage.getMusicList(sheet.id);
            const sortType = storage.getSheetMeta(sheet.id, 'sort') as SortType;
            sheet.worksNum = musicList.length;
            migrateV2.migrate(sheet.id, musicList);
            musicListMap.set(
                sheet.id,
                new SortedMusicList(musicList, sortType, true),
            );
            sheet.worksNum = musicList.length;
            ee.emit('UpdateMusicList', {
                sheetId: sheet.id,
                updateType: 'length',
            });
        }
        migrateV2.done();
        getDefaultStore().set(musicSheetsBaseAtom, allSheets);
        setupStarredMusicSheets();
    } catch (e: any) {
        if (e.message === 'not exist') {
            await storage.setSheets([defaultSheet]);
            await storage.setMusicList(defaultSheet.id, []);
            getDefaultStore().set(musicSheetsBaseAtom, [defaultSheet]);
            musicListMap.set(
                defaultSheet.id,
                new SortedMusicList([], SortType.None, true),
            );
        }
    }
}

// 获取音乐
function getSortedMusicListBySheetId(sheetId: string) {
    let musicList: SortedMusicList;
    if (!musicListMap.has(sheetId)) {
        musicList = new SortedMusicList([], SortType.None, true);
        musicListMap.set(sheetId, musicList);
    } else {
        musicList = musicListMap.get(sheetId)!;
    }

    return musicList;
}

/**
 * 更新基本信息
 * @param sheetId 歌单ID
 * @param data 歌单数据
 */
async function updateMusicSheetBase(
    sheetId: string,
    data: Partial<IMusic.IMusicSheetItemBase>,
) {
    const musicSheets = getDefaultStore().get(musicSheetsBaseAtom);
    const targetSheetIndex = musicSheets.findIndex(it => it.id === sheetId);

    if (targetSheetIndex === -1) {
        return;
    }

    const newMusicSheets = produce(musicSheets, draft => {
        draft[targetSheetIndex] = {
            ...draft[targetSheetIndex],
            ...data,
            id: sheetId,
        };
        return draft;
    });
    await storage.setSheets(newMusicSheets);
    getDefaultStore().set(musicSheetsBaseAtom, newMusicSheets);
    ee.emit('UpdateSheetBasic', {
        sheetId,
    });
}

/**
 * 新建歌单
 * @param title 歌单名称
 */
async function addSheet(title: string) {
    const newId = nanoid();
    const musicSheets = getDefaultStore().get(musicSheetsBaseAtom);

    const newSheets: IMusic.IMusicSheetItemBase[] = [
        musicSheets[0],
        {
            title,
            id: newId,
            coverImg: undefined,
            worksNum: 0,
            createAt: Date.now(),
        },
        ...musicSheets.slice(1),
    ];
    // 写入存储
    await storage.setSheets(newSheets);
    await storage.setMusicList(newId, []);

    // 更新状态
    getDefaultStore().set(musicSheetsBaseAtom, newSheets);
    let defaultSortType = Config.get('setting.basic.musicOrderInLocalSheet');
    if (
        defaultSortType &&
        [
            SortType.Newest,
            SortType.Artist,
            SortType.Album,
            SortType.Oldest,
            SortType.Title,
        ].includes(defaultSortType)
    ) {
        storage.setSheetMeta(newId, 'sort', defaultSortType);
    } else {
        defaultSortType = SortType.None;
    }
    musicListMap.set(newId, new SortedMusicList([], defaultSortType, true));
    return newId;
}

async function resumeSheets(
    sheets: IMusic.IMusicSheetItem[],
    resumeMode: ResumeMode,
) {
    if (resumeMode === ResumeMode.Append) {
        // 逆序恢复，最新创建的在最上方
        for (let i = sheets.length - 1; i >= 0; --i) {
            const newSheetId = await addSheet(sheets[i].title || '');
            await addMusic(newSheetId, sheets[i].musicList || []);
        }
        return;
    }
    // 1. 分离默认歌单和其他歌单
    const defaultSheetIndex = sheets.findIndex(it => it.id === defaultSheet.id);

    let exportedDefaultSheet: IMusic.IMusicSheetItem | null = null;

    if (defaultSheetIndex !== -1) {
        exportedDefaultSheet = sheets.splice(defaultSheetIndex, 1)[0];
    }

    // 2. 合并默认歌单
    await addMusic(defaultSheet.id, exportedDefaultSheet?.musicList || []);

    // 3. 合并其他歌单
    if (resumeMode === ResumeMode.OverwriteDefault) {
        // 逆序恢复，最新创建的在最上方
        for (let i = sheets.length - 1; i >= 0; --i) {
            const newSheetId = await addSheet(sheets[i].title || '');
            await addMusic(newSheetId, sheets[i].musicList || []);
        }
    } else {
        // 合并同名
        const existsSheetIdMap: Record<string, string> = {};
        const allSheets = getDefaultStore().get(musicSheetsBaseAtom);
        allSheets.forEach(it => {
            existsSheetIdMap[it.title!] = it.id;
        });
        for (let i = sheets.length - 1; i >= 0; --i) {
            let newSheetId = existsSheetIdMap[sheets[i].title || ''];
            if (!newSheetId) {
                newSheetId = await addSheet(sheets[i].title || '');
            }
            await addMusic(newSheetId, sheets[i].musicList || []);
        }
    }
}

function backupSheets() {
    const allSheets = getDefaultStore().get(musicSheetsBaseAtom);
    return allSheets.map(it => ({
        ...it,
        musicList: musicListMap.get(it.id)?.musicList || [],
    })) as IMusic.IMusicSheetItem[];
}

/**
 * 删除歌单
 * @param sheetId 歌单id
 */
async function removeSheet(sheetId: string) {
    // 只能删除非默认歌单
    if (sheetId === defaultSheet.id) {
        return;
    }
    const musicSheets = getDefaultStore().get(musicSheetsBaseAtom);

    // 删除后的歌单
    const newSheets = musicSheets.filter(item => item.id !== sheetId);

    // 写入存储
    storage.removeMusicList(sheetId);
    await storage.setSheets(newSheets);

    // 修改状态
    getDefaultStore().set(musicSheetsBaseAtom, newSheets);
    musicListMap.delete(sheetId);
}

/**
 * 向歌单内添加音乐
 * @param sheetId 歌单id
 * @param musicItem 音乐
 */
async function addMusic(
    sheetId: string,
    musicItem: IMusic.IMusicItem | Array<IMusic.IMusicItem>,
) {
    const now = Date.now();
    if (!Array.isArray(musicItem)) {
        musicItem = [musicItem];
    }
    const taggedMusicItems = musicItem.map((it, index) => ({
        ...it,
        $timestamp: now,
        $sortIndex: musicItem.length - index,
    }));

    let musicList = getSortedMusicListBySheetId(sheetId);

    const addedCount = musicList.add(taggedMusicItems);

    // Update
    if (!addedCount) {
        return;
    }
    const musicSheets = getDefaultStore().get(musicSheetsBaseAtom);
    if (
        !musicSheets
            .find(_ => _.id === sheetId)
            ?.coverImg?.startsWith('file://')
    ) {
        await updateMusicSheetBase(sheetId, {
            coverImg: musicList.at(0)?.artwork,
        });
    }

    // 更新音乐数量
    getDefaultStore().set(
        musicSheetsBaseAtom,
        produce(draft => {
            const musicSheet = draft.find(it => it.id === sheetId);
            if (musicSheet) {
                musicSheet.worksNum = musicList.length;
            }
        }),
    );

    await storage.setMusicList(sheetId, musicList.musicList);
    ee.emit('UpdateMusicList', {
        sheetId,
        updateType: 'length',
    });
}

async function removeMusicByIndex(sheetId: string, indices: number | number[]) {
    if (!Array.isArray(indices)) {
        indices = [indices];
    }

    const musicList = getSortedMusicListBySheetId(sheetId);

    musicList.removeByIndex(indices);

    // Update
    const musicSheets = getDefaultStore().get(musicSheetsBaseAtom);
    if (
        !musicSheets
            .find(_ => _.id === sheetId)
            ?.coverImg?.startsWith('file://')
    ) {
        await updateMusicSheetBase(sheetId, {
            coverImg: musicList.at(0)?.artwork,
        });
    }
    // 更新音乐数量
    getDefaultStore().set(
        musicSheetsBaseAtom,
        produce(draft => {
            const musicSheet = draft.find(it => it.id === sheetId);
            if (musicSheet) {
                musicSheet.worksNum = musicList.length;
            }
        }),
    );
    await storage.setMusicList(sheetId, musicList.musicList);
    ee.emit('UpdateMusicList', {
        sheetId,
        updateType: 'length',
    });
}

async function removeMusic(
    sheetId: string,
    musicItems: IMusic.IMusicItem | IMusic.IMusicItem[],
) {
    if (!Array.isArray(musicItems)) {
        musicItems = [musicItems];
    }

    const musicList = getSortedMusicListBySheetId(sheetId);
    musicList.remove(musicItems);

    // Update
    const musicSheets = getDefaultStore().get(musicSheetsBaseAtom);

    let patchData: Partial<IMusic.IMusicSheetItemBase> = {};
    if (
        !musicSheets
            .find(_ => _.id === sheetId)
            ?.coverImg?.startsWith('file://')
    ) {
        patchData.coverImg = musicList.at(0)?.artwork;
    }
    patchData.worksNum = musicList.length;
    await updateMusicSheetBase(sheetId, {
        coverImg: musicList.at(0)?.artwork,
    });

    await storage.setMusicList(sheetId, musicList.musicList);
    ee.emit('UpdateMusicList', {
        sheetId,
        updateType: 'length',
    });
}

async function setSortType(sheetId: string, sortType: SortType) {
    const musicList = getSortedMusicListBySheetId(sheetId);
    musicList.setSortType(sortType);

    // update
    await storage.setMusicList(sheetId, musicList.musicList);
    storage.setSheetMeta(sheetId, 'sort', sortType);
    ee.emit('UpdateMusicList', {
        sheetId,
        updateType: 'resort',
    });
}

async function manualSort(
    sheetId: string,
    musicListAfterSort: IMusic.IMusicItem[],
) {
    const musicList = getSortedMusicListBySheetId(sheetId);
    musicList.manualSort(musicListAfterSort);

    // update
    await storage.setMusicList(sheetId, musicList.musicList);
    storage.setSheetMeta(sheetId, 'sort', SortType.None);

    ee.emit('UpdateMusicList', {
        sheetId,
        updateType: 'resort',
    });
}

function useSheetsBase() {
    return useAtomValue(musicSheetsBaseAtom);
}

// sheetId should not change
function useSheetItem(sheetId: string) {
    const sheetsBase = useAtomValue(musicSheetsBaseAtom);

    const [sheetItem, setSheetItem] = useState<IMusic.IMusicSheetItem>({
        ...(sheetsBase.find(it => it.id === sheetId) ||
            ({} as IMusic.IMusicSheetItemBase)),
        musicList: musicListMap.get(sheetId)?.musicList || [],
    });

    useEffect(() => {
        const onUpdateMusicList = ({sheetId: updatedSheetId}) => {
            if (updatedSheetId !== sheetId) {
                return;
            }
            setSheetItem(prev => ({
                ...prev,
                musicList: musicListMap.get(sheetId)?.musicList || [],
            }));
        };

        const onUpdateSheetBasic = ({sheetId: updatedSheetId}) => {
            if (updatedSheetId !== sheetId) {
                return;
            }
            setSheetItem(prev => ({
                ...prev,
                ...(getDefaultStore()
                    .get(musicSheetsBaseAtom)
                    .find(it => it.id === sheetId) || {}),
            }));
        };
        ee.on('UpdateMusicList', onUpdateMusicList);
        ee.on('UpdateSheetBasic', onUpdateSheetBasic);

        return () => {
            ee.off('UpdateMusicList', onUpdateMusicList);
            ee.off('UpdateSheetBasic', onUpdateSheetBasic);
        };
    }, []);

    return sheetItem;
}

function useFavorite(musicItem: IMusic.IMusicItem | null) {
    const [fav, setFav] = useState(false);

    useEffect(() => {
        const onUpdateMusicList = ({sheetId: updatedSheetId, updateType}) => {
            if (updatedSheetId !== defaultSheet.id || updateType === 'resort') {
                return;
            }
            setFav(musicListMap.get(defaultSheet.id)?.has(musicItem) || false);
        };
        ee.on('UpdateMusicList', onUpdateMusicList);

        setFav(musicListMap.get(defaultSheet.id)?.has(musicItem) || false);
        return () => {
            ee.off('UpdateMusicList', onUpdateMusicList);
        };
    }, [musicItem]);

    return fav;
}

async function setupStarredMusicSheets() {
    const starredSheets: IMusic.IMusicSheetItem[] =
        storage.getStarredSheets() || [];
    getDefaultStore().set(starredMusicSheetsAtom, starredSheets);
}

async function starMusicSheet(musicSheet: IMusic.IMusicSheetItem) {
    const store = getDefaultStore();
    const starredSheets: IMusic.IMusicSheetItem[] = store.get(
        starredMusicSheetsAtom,
    );

    const newVal = [musicSheet, ...starredSheets];

    store.set(starredMusicSheetsAtom, newVal);
    await storage.setStarredSheets(newVal);
}

async function unstarMusicSheet(musicSheet: IMusic.IMusicSheetItemBase) {
    const store = getDefaultStore();
    const starredSheets: IMusic.IMusicSheetItem[] = store.get(
        starredMusicSheetsAtom,
    );

    const newVal = starredSheets.filter(
        it =>
            !isSameMediaItem(
                it as ICommon.IMediaBase,
                musicSheet as ICommon.IMediaBase,
            ),
    );
    store.set(starredMusicSheetsAtom, newVal);
    await storage.setStarredSheets(newVal);
}

function useSheetIsStarred(
    musicSheet: IMusic.IMusicSheetItem | null | undefined,
) {
    // TODO: 类型有问题
    const musicSheets = useAtomValue(starredMusicSheetsAtom);
    return useMemo(() => {
        if (!musicSheet) {
            return false;
        }
        return (
            musicSheets.findIndex(it =>
                isSameMediaItem(
                    it as ICommon.IMediaBase,
                    musicSheet as ICommon.IMediaBase,
                ),
            ) !== -1
        );
    }, [musicSheet, musicSheets]);
}

function useStarredSheets() {
    return useAtomValue(starredMusicSheetsAtom);
}

/********* MusicSheet Meta ****************/

const MusicSheet = {
    setup,
    addSheet,
    defaultSheet,
    addMusic,
    removeSheet,
    backupSheets,
    resumeSheets,
    removeMusicByIndex,
    removeMusic,
    starMusicSheet,
    unstarMusicSheet,
    useFavorite,
    useSheetsBase,
    useSheetItem,
    setSortType,
    useSheetIsStarred,
    useStarredSheets,
    updateMusicSheetBase,
    manualSort,
    getSheetMeta: storage.getSheetMeta,
};

export default MusicSheet;
