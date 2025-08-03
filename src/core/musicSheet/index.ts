/**
 * 歌单管理
 */
import { ResumeMode, SortType, localPluginPlatform } from "@/constants/commonConst.ts";
import { IAppConfig } from "@/types/core/config";
import { IInjectable } from "@/types/infra";
import { isSameMediaItem } from "@/utils/mediaUtils";
import EventEmitter from "eventemitter3";
import { Immer } from "immer";
import { atom, getDefaultStore, useAtomValue } from "jotai";
import { nanoid } from "nanoid";
import { useEffect, useMemo, useState } from "react";
import migrate, { migrateV2 } from "./migrate.ts";
import SortedMusicList from "./sortedMusicList.ts";
import storage from "./storage.ts";

const produce = new Immer({
    autoFreeze: false,
}).produce;

const _defaultSheet: IMusic.IMusicSheetItemBase = {
    id: "favorite",
    platform: localPluginPlatform,
    coverImg: undefined,
    title: "我喜欢",
    worksNum: 0,
};

const musicSheetsBaseAtom = atom<IMusic.IMusicSheetItemBase[]>([]);

const starredMusicSheetsAtom = atom<IMusic.IMusicSheetItem[]>([]);

// key: sheetId, value: musicList
const musicListMap = new Map<string, SortedMusicList>();


const ee = new EventEmitter<{
    UpdateMusicList: (updateInfo: {
        sheetId: string;
        updateType: "length" | "resort"; // 更新类型
    }) => void;
    UpdateSheetBasic: (data: {
        sheetId: string;
    }) => void;
}>();

class MusicSheetClazz implements IInjectable {
    private appConfig!: IAppConfig;

    defaultSheet: IMusic.IMusicSheetItemBase = _defaultSheet;

    injectDependencies(appConfigService: IAppConfig): void {
        this.appConfig = appConfigService;
    }


    async setup() {
        // 升级逻辑 - 从 AsyncStorage 升级到 MMKV
        await migrate();
        try {
            const allSheets: IMusic.IMusicSheetItemBase[] = storage.getSheets();

            if (!Array.isArray(allSheets)) {
                throw new Error("not exist");
            }

            let needRestore = false;
            if (!allSheets.length) {
                allSheets.push({
                    ..._defaultSheet,
                });
                needRestore = true;
            }
            if (allSheets[0].id !== _defaultSheet.id) {
                const defaultSheetIndex = allSheets.findIndex(
                    it => it.id === _defaultSheet.id,
                );

                if (defaultSheetIndex === -1) {
                    allSheets.unshift({
                        ..._defaultSheet,
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
                const sortType = storage.getSheetMeta(sheet.id, "sort") as SortType;
                sheet.worksNum = musicList.length;
                migrateV2.migrate(sheet.id, musicList);
                musicListMap.set(
                    sheet.id,
                    new SortedMusicList(musicList, sortType, true),
                );
                sheet.worksNum = musicList.length;
                ee.emit("UpdateMusicList", {
                    sheetId: sheet.id,
                    updateType: "length",
                });
            }
            migrateV2.done();
            getDefaultStore().set(musicSheetsBaseAtom, allSheets);


            // 收藏的歌单
            const starredSheets: IMusic.IMusicSheetItem[] =
                storage.getStarredSheets() || [];
            getDefaultStore().set(starredMusicSheetsAtom, starredSheets);

        } catch (e: any) {
            if (e.message === "not exist") {
                await storage.setSheets([_defaultSheet]);
                await storage.setMusicList(_defaultSheet.id, []);
                getDefaultStore().set(musicSheetsBaseAtom, [_defaultSheet]);
                musicListMap.set(
                    _defaultSheet.id,
                    new SortedMusicList([], SortType.None, true),
                );
            }
        }


    }

    // 获取音乐
    getSortedMusicListBySheetId(sheetId: string) {
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
    async updateMusicSheetBase(
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
        ee.emit("UpdateSheetBasic", {
            sheetId,
        });
    }


    /**
 * 新建歌单
 * @param title 歌单名称
 */
    async addSheet(title: string) {
        const newId = nanoid();
        const musicSheets = getDefaultStore().get(musicSheetsBaseAtom);

        const newSheets: IMusic.IMusicSheetItemBase[] = [
            musicSheets[0],
            {
                title,
                platform: localPluginPlatform,
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
        let defaultSortType = this.appConfig.getConfig("basic.musicOrderInLocalSheet");
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
            storage.setSheetMeta(newId, "sort", defaultSortType);
        } else {
            defaultSortType = SortType.None;
        }
        musicListMap.set(newId, new SortedMusicList([], defaultSortType, true));
        return newId;
    }


    backupSheets() {
        const allSheets = getDefaultStore().get(musicSheetsBaseAtom);
        return allSheets.map(it => ({
            ...it,
            musicList: musicListMap.get(it.id)?.musicList || [],
        })) as IMusic.IMusicSheetItem[];
    }


    async resumeSheets(
        sheets: IMusic.IMusicSheetItem[],
        resumeMode: ResumeMode,
    ) {
        if (resumeMode === ResumeMode.Append) {
            // 逆序恢复，最新创建的在最上方
            for (let i = sheets.length - 1; i >= 0; --i) {
                const newSheetId = await this.addSheet(sheets[i].title || "");
                await this.addMusic(newSheetId, sheets[i].musicList || []);
            }
            return;
        }
        // 1. 分离默认歌单和其他歌单
        const defaultSheetIndex = sheets.findIndex(it => it.id === _defaultSheet.id);

        let exportedDefaultSheet: IMusic.IMusicSheetItem | null = null;

        if (defaultSheetIndex !== -1) {
            exportedDefaultSheet = sheets.splice(defaultSheetIndex, 1)[0];
        }

        // 2. 合并默认歌单
        await this.addMusic(_defaultSheet.id, exportedDefaultSheet?.musicList || []);

        // 3. 合并其他歌单
        if (resumeMode === ResumeMode.OverwriteDefault) {
            // 逆序恢复，最新创建的在最上方
            for (let i = sheets.length - 1; i >= 0; --i) {
                const newSheetId = await this.addSheet(sheets[i].title || "");
                await this.addMusic(newSheetId, sheets[i].musicList || []);
            }
        } else {
            // 合并同名
            const existsSheetIdMap: Record<string, string> = {};
            const allSheets = getDefaultStore().get(musicSheetsBaseAtom);
            allSheets.forEach(it => {
                existsSheetIdMap[it.title!] = it.id;
            });
            for (let i = sheets.length - 1; i >= 0; --i) {
                let newSheetId = existsSheetIdMap[sheets[i].title || ""];
                if (!newSheetId) {
                    newSheetId = await this.addSheet(sheets[i].title || "");
                }
                await this.addMusic(newSheetId, sheets[i].musicList || []);
            }
        }
    }


    /**
     * 删除歌单
     * @param sheetId 歌单id
     */
    async removeSheet(sheetId: string) {
        // 只能删除非默认歌单
        if (sheetId === _defaultSheet.id) {
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
    async addMusic(
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

        let musicList = this.getSortedMusicListBySheetId(sheetId);

        const addedCount = musicList.add(taggedMusicItems);

        // Update
        if (!addedCount) {
            return;
        }
        const musicSheets = getDefaultStore().get(musicSheetsBaseAtom);
        if (
            !musicSheets
                .find(_ => _.id === sheetId)
                ?.coverImg?.startsWith?.("file://")
        ) {
            await this.updateMusicSheetBase(sheetId, {
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
        ee.emit("UpdateMusicList", {
            sheetId,
            updateType: "length",
        });
    }


    async removeMusicByIndex(sheetId: string, indices: number | number[]) {
        if (!Array.isArray(indices)) {
            indices = [indices];
        }

        const musicList = this.getSortedMusicListBySheetId(sheetId);

        musicList.removeByIndex(indices);

        // Update
        const musicSheets = getDefaultStore().get(musicSheetsBaseAtom);
        if (
            !musicSheets
                .find(_ => _.id === sheetId)
                ?.coverImg?.startsWith("file://")
        ) {
            await this.updateMusicSheetBase(sheetId, {
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
        ee.emit("UpdateMusicList", {
            sheetId,
            updateType: "length",
        });
    }


    async removeMusic(
        sheetId: string,
        musicItems: IMusic.IMusicItem | IMusic.IMusicItem[],
    ) {
        if (!Array.isArray(musicItems)) {
            musicItems = [musicItems];
        }

        const musicList = this.getSortedMusicListBySheetId(sheetId);
        musicList.remove(musicItems);

        // Update
        const musicSheets = getDefaultStore().get(musicSheetsBaseAtom);

        let patchData: Partial<IMusic.IMusicSheetItemBase> = {};
        if (
            !musicSheets
                .find(_ => _.id === sheetId)
                ?.coverImg?.startsWith?.("file://")
        ) {
            patchData.coverImg = musicList.at(0)?.artwork;
        }
        patchData.worksNum = musicList.length;
        await this.updateMusicSheetBase(sheetId, {
            coverImg: musicList.at(0)?.artwork,
        });

        await storage.setMusicList(sheetId, musicList.musicList);
        ee.emit("UpdateMusicList", {
            sheetId,
            updateType: "length",
        });
    }


    async setSortType(sheetId: string, sortType: SortType) {
        const musicList = this.getSortedMusicListBySheetId(sheetId);
        musicList.setSortType(sortType);

        // update
        await storage.setMusicList(sheetId, musicList.musicList);
        storage.setSheetMeta(sheetId, "sort", sortType);
        ee.emit("UpdateMusicList", {
            sheetId,
            updateType: "resort",
        });
    }

    async manualSort(
        sheetId: string,
        musicListAfterSort: IMusic.IMusicItem[],
    ) {
        const musicList = this.getSortedMusicListBySheetId(sheetId);
        musicList.manualSort(musicListAfterSort);

        // update
        await storage.setMusicList(sheetId, musicList.musicList);
        storage.setSheetMeta(sheetId, "sort", SortType.None);

        ee.emit("UpdateMusicList", {
            sheetId,
            updateType: "resort",
        });
    }

    getSheetMeta = storage.getSheetMeta;



    /*********** 远程歌单的收藏逻辑 ***********/
    async starMusicSheet(musicSheet: IMusic.IMusicSheetItem) {
        const store = getDefaultStore();
        const starredSheets: IMusic.IMusicSheetItem[] = store.get(
            starredMusicSheetsAtom,
        );

        const newVal = [musicSheet, ...starredSheets];

        store.set(starredMusicSheetsAtom, newVal);
        await storage.setStarredSheets(newVal);
    }

    async unstarMusicSheet(musicSheet: IMusic.IMusicSheetItemBase) {
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
}



const MusicSheet = new MusicSheetClazz();
export default MusicSheet;


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
        const onUpdateMusicList = ({ sheetId: updatedSheetId }) => {
            if (updatedSheetId !== sheetId) {
                return;
            }
            setSheetItem(prev => ({
                ...prev,
                musicList: musicListMap.get(sheetId)?.musicList || [],
            }));
        };

        const onUpdateSheetBasic = ({ sheetId: updatedSheetId }) => {
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
        ee.on("UpdateMusicList", onUpdateMusicList);
        ee.on("UpdateSheetBasic", onUpdateSheetBasic);

        return () => {
            ee.off("UpdateMusicList", onUpdateMusicList);
            ee.off("UpdateSheetBasic", onUpdateSheetBasic);
        };
    }, []);

    return sheetItem;
}

function useFavorite(musicItem: IMusic.IMusicItem | null) {
    const [fav, setFav] = useState(false);

    useEffect(() => {
        const onUpdateMusicList = ({ sheetId: updatedSheetId, updateType }) => {
            if (updatedSheetId !== _defaultSheet.id || updateType === "resort") {
                return;
            }
            setFav(musicListMap.get(_defaultSheet.id)?.has(musicItem) || false);
        };
        ee.on("UpdateMusicList", onUpdateMusicList);

        setFav(musicListMap.get(_defaultSheet.id)?.has(musicItem) || false);
        return () => {
            ee.off("UpdateMusicList", onUpdateMusicList);
        };
    }, [musicItem]);

    return fav;
}

function useSheetIsStarred(
    musicSheet?: IMusic.IMusicSheetItem | null,
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


export { useSheetIsStarred, useSheetsBase, useSheetItem, useStarredSheets, useFavorite };
