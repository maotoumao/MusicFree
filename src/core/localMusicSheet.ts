import {
    internalSerializeKey,
    StorageKeys,
    supportLocalMediaType,
} from '@/constants/commonConst';
import mp3Util, {IBasicMeta} from '@/native/mp3Util';
import {
    getInternalData,
    InternalDataType,
    isSameMediaItem,
} from '@/utils/mediaItem';
import StateMapper from '@/utils/stateMapper';
import {getStorage, setStorage} from '@/utils/storage';
import {nanoid} from 'nanoid';
import {useEffect, useState} from 'react';
import {FileStat, FileSystem} from 'react-native-file-access';
import {unlink} from 'react-native-fs';

let localSheet: IMusic.IMusicItem[] = [];
const localSheetStateMapper = new StateMapper(() => localSheet);

export async function setup() {
    const sheet = await getStorage(StorageKeys.LocalMusicSheet);
    if (sheet) {
        let validSheet = [];
        for (let musicItem of sheet) {
            const localPath = getInternalData<string>(
                musicItem,
                InternalDataType.LOCALPATH,
            );
            if (localPath && (await FileSystem.exists(localPath))) {
                validSheet.push(musicItem);
            }
        }
        if (validSheet.length !== sheet.length) {
            await setStorage(StorageKeys.LocalMusicSheet, validSheet);
        }
        localSheet = validSheet;
    } else {
        await setStorage(StorageKeys.LocalMusicSheet, []);
    }
    localSheetStateMapper.notify();
}

export async function addMusic(
    musicItem: IMusic.IMusicItem | IMusic.IMusicItem[],
) {
    if (!Array.isArray(musicItem)) {
        musicItem = [musicItem];
    }
    let newSheet = [...localSheet];
    musicItem.forEach(mi => {
        if (localSheet.findIndex(_ => isSameMediaItem(mi, _)) === -1) {
            newSheet.push(mi);
        }
    });
    await setStorage(StorageKeys.LocalMusicSheet, newSheet);
    localSheet = newSheet;
    localSheetStateMapper.notify();
}

function addMusicDraft(musicItem: IMusic.IMusicItem | IMusic.IMusicItem[]) {
    if (!Array.isArray(musicItem)) {
        musicItem = [musicItem];
    }
    let newSheet = [...localSheet];
    musicItem.forEach(mi => {
        if (localSheet.findIndex(_ => isSameMediaItem(mi, _)) === -1) {
            newSheet.push(mi);
        }
    });
    localSheet = newSheet;
    localSheetStateMapper.notify();
}

async function saveLocalSheet() {
    await setStorage(StorageKeys.LocalMusicSheet, localSheet);
}

export async function removeMusic(
    musicItem: IMusic.IMusicItem,
    deleteOriginalFile = false,
) {
    const idx = localSheet.findIndex(_ => isSameMediaItem(_, musicItem));
    let newSheet = [...localSheet];
    if (idx !== -1) {
        const localMusicItem = localSheet[idx];
        newSheet.splice(idx, 1);
        const localPath =
            musicItem[internalSerializeKey]?.localPath ??
            localMusicItem[internalSerializeKey]?.localPath;
        if (deleteOriginalFile && localPath) {
            await unlink(localPath);
        }
    }
    localSheet = newSheet;
    localSheetStateMapper.notify();
}

function parseFilename(fn: string): Partial<IMusic.IMusicItem> | null {
    const data = fn.slice(0, fn.lastIndexOf('.')).split('@');
    const [platform, id, title, artist] = data;
    if (!platform || !id) {
        return null;
    }
    return {
        id,
        platform: platform,
        title: title ?? '',
        artist: artist ?? '',
    };
}

function localMediaFilter(_: FileStat) {
    return supportLocalMediaType.some(ext => _.filename.endsWith(ext));
}

let importToken: string | null = null;
// 获取本地的文件列表
async function getMusicStats(folderPaths: string[]) {
    const _importToken = nanoid();
    importToken = _importToken;
    const musicList: FileStat[] = [];
    let peek: string | undefined;
    let dirFiles: FileStat[] = [];
    while (folderPaths.length !== 0) {
        if (importToken !== _importToken) {
            throw new Error('Import Broken');
        }
        peek = folderPaths.shift() as string;
        try {
            dirFiles = await FileSystem.statDir(peek);
        } catch {
            dirFiles = [];
        }

        dirFiles.forEach(item => {
            if (item.type === 'directory' && !folderPaths.includes(item.path)) {
                folderPaths.push(item.path);
            } else if (localMediaFilter(item)) {
                musicList.push(item);
            }
        });
    }
    return {musicList, token: _importToken};
}

function cancelImportLocal() {
    importToken = null;
}

// 导入本地音乐
const groupNum = 25;
async function importLocal(_folderPaths: string[]) {
    const folderPaths = [..._folderPaths];
    const {musicList, token} = await getMusicStats(folderPaths);
    if (token !== importToken) {
        throw new Error('Import Broken');
    }
    // 分组请求，不然序列化可能出问题
    let metas: IBasicMeta[] = [];
    const groups = Math.ceil(musicList.length / groupNum);
    for (let i = 0; i < groups; ++i) {
        metas = metas.concat(
            await mp3Util.getMediaMeta(
                musicList
                    .slice(i * groupNum, (i + 1) * groupNum)
                    .map(_ => _.path),
            ),
        );
    }
    if (token !== importToken) {
        throw new Error('Import Broken');
    }
    const musicItems = await Promise.all(
        musicList.map(async (musicStat, index) => {
            let {platform, id, title, artist} =
                parseFilename(musicStat.filename) ?? {};
            const meta = metas[index];
            if (!platform || !id) {
                platform = '本地';
                id = await FileSystem.hash(musicStat.path, 'MD5');
            }
            return {
                id,
                platform,
                title: title ?? meta?.title ?? musicStat.filename,
                artist: artist ?? meta?.artist ?? '未知歌手',
                duration: parseInt(meta?.duration ?? '0') / 1000,
                album: meta?.album ?? '未知专辑',
                artwork: '',
                [internalSerializeKey]: {
                    localPath: musicStat.path,
                },
            };
        }),
    );
    if (token !== importToken) {
        throw new Error('Import Broken');
    }
    addMusic(musicItems);
}

/** 是否为本地音乐 */
function isLocalMusic(
    musicItem: ICommon.IMediaBase | null,
): IMusic.IMusicItem | undefined {
    return musicItem
        ? localSheet.find(_ => isSameMediaItem(_, musicItem))
        : undefined;
}

/** 状态-是否为本地音乐 */
function useIsLocal(musicItem: IMusic.IMusicItem | null) {
    const localMusicState = localSheetStateMapper.useMappedState();
    const [isLocal, setIsLocal] = useState<boolean>(!!isLocalMusic(musicItem));
    useEffect(() => {
        if (!musicItem) {
            setIsLocal(false);
        } else {
            setIsLocal(!!isLocalMusic(musicItem));
        }
    }, [localMusicState, musicItem]);
    return isLocal;
}

function getMusicList() {
    return localSheet;
}

async function updateMusicList(newSheet: IMusic.IMusicItem[]) {
    const _localSheet = [...newSheet];
    try {
        await setStorage(StorageKeys.LocalMusicSheet, _localSheet);
        localSheet = _localSheet;
        localSheetStateMapper.notify();
    } catch {}
}

const LocalMusicSheet = {
    setup,
    addMusic,
    removeMusic,
    addMusicDraft,
    saveLocalSheet,
    importLocal,
    cancelImportLocal,
    isLocalMusic,
    useIsLocal,
    getMusicList,
    useMusicList: localSheetStateMapper.useMappedState,
    updateMusicList,
};

export default LocalMusicSheet;
