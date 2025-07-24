import getOrCreateMMKV from "@/utils/getOrCreateMMKV.ts";
import { InteractionManager } from "react-native";
import { SortType } from "@/constants/commonConst.ts";
import { safeParse, safeStringify } from "@/utils/jsonUtil";

function getStorageData(key: string) {
    const mmkv = getOrCreateMMKV(`LocalSheet.${key}`);

    return safeParse(mmkv.getString("data"));
}

async function setStorageData(key: string, value: any) {
    return InteractionManager.runAfterInteractions(() => {
        const mmkv = getOrCreateMMKV(`LocalSheet.${key}`);
        mmkv.set("data", safeStringify(value));
    });
}

function removeStorageData(key: string) {
    const mmkv = getOrCreateMMKV(`LocalSheet.${key}`);
    mmkv.clearAll();
}

/**
 * 存储歌单的基本信息
 * @param sheets 歌单数据
 */
async function setSheets(sheets: IMusic.IMusicSheetItemBase[]) {
    return await setStorageData("music-sheets", sheets);
}

/**
 * 获取歌单的基本信息
 */
function getSheets(): IMusic.IMusicSheetItemBase[] {
    return getStorageData("music-sheets");
}

/**
 * 存储歌单的基本信息
 * @param sheets 歌单数据
 */
async function setStarredSheets(sheets: IMusic.IMusicSheetItemBase[]) {
    return await setStorageData("starred-sheets", sheets);
}

/**
 * 获取歌单的基本信息
 */
function getStarredSheets(): IMusic.IMusicSheetItem[] {
    return getStorageData("starred-sheets");
}

/**
 * 存储歌单内的歌曲
 * @param sheetId 歌单id
 * @param musicList 歌曲列表
 */
async function setMusicList(sheetId: string, musicList: IMusic.IMusicItem[]) {
    return await setStorageData(sheetId, musicList);
}

/**
 * 获取歌单内的歌曲
 * @param sheetId 歌单id
 * @returns 歌曲列表
 */
function getMusicList(sheetId: string): IMusic.IMusicItem[] {
    return getStorageData(sheetId);
}

/**
 * 清空歌单内的歌曲/其他信息
 * @param sheetId
 */
function removeMusicList(sheetId: string) {
    return removeStorageData(sheetId);
}

interface IMusicSheetMeta extends Record<string, string> {
    sort: SortType;
}

function setSheetMeta<K extends keyof IMusicSheetMeta>(
    sheetId: string,
    key: K,
    value: IMusicSheetMeta[K],
) {
    const mmkv = getOrCreateMMKV(`LocalSheet.${sheetId}`);
    mmkv.set("meta." + key, value);
}

function getSheetMeta<K extends keyof IMusicSheetMeta>(
    sheetId: string,
    key: K,
): IMusicSheetMeta[K] | null {
    const mmkv = getOrCreateMMKV(`LocalSheet.${sheetId}`);
    return mmkv.getString("meta." + key) || null;
}

const storage = {
    setSheets,
    getSheets,
    setMusicList,
    getMusicList,
    removeMusicList,
    setSheetMeta,
    getSheetMeta,
    setStarredSheets,
    getStarredSheets,
};

export default storage;
