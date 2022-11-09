import {internalSerializeKey, StorageKeys} from '@/constants/commonConst';
import mp3Util, {IBasicMeta} from '@/native/mp3Util';
import {errorLog} from '@/utils/log';
import {
    getInternalData,
    InternalDataType,
    isSameMediaItem,
} from '@/utils/mediaItem';
import StateMapper from '@/utils/stateMapper';
import {getStorage, setStorage} from '@/utils/storage';
import {useEffect, useState} from 'react';
import {FileStat, FileSystem} from 'react-native-file-access';

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

export async function removeMusic(
    musicItem: IMusic.IMusicItem,
    deleteOriginalFile = false,
) {
    const idx = localSheet.findIndex(_ => isSameMediaItem(_, musicItem));
    let newSheet = [...localSheet];
    if (idx !== -1) {
        newSheet.splice(idx, 1);
        if (deleteOriginalFile && musicItem[internalSerializeKey]?.localPath) {
            await FileSystem.unlink(musicItem[internalSerializeKey].localPath);
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
        platform,
        title,
        artist,
    };
}

/** 从文件夹导入 */
async function importFolder(folderPath: string) {
    const dirFiles = await FileSystem.statDir(folderPath);
    const musicFiles = dirFiles.filter(
        // todo: flac播放没有声音
        _ =>
            _.type === 'file' &&
            (_.filename.endsWith('.mp3') || _.filename.endsWith('.flac')),
    );

    const musicItems: IMusic.IMusicItem[] = await Promise.all(
        musicFiles.map(async mf => {
            let {platform, id, title, artist} =
                parseFilename(mf.filename) ?? {};

            let meta: IBasicMeta | null;
            try {
                meta = await mp3Util.getBasicMeta(mf.path);
            } catch {
                meta = null;
            }
            if (!platform || !id) {
                platform = '本地';
                id = await FileSystem.hash(mf.path, 'MD5');
            }
            return {
                id,
                platform,
                title: title ?? meta?.title ?? mf.filename,
                artist: artist ?? meta?.artist ?? '未知歌手',
                duration: parseInt(meta?.duration ?? '0') / 1000,
                album: meta?.album ?? '未知专辑',
                artwork: '',
                [internalSerializeKey]: {
                    localPath: mf.path,
                },
            };
        }),
    );
    addMusic(musicItems);
}

function localMediaFilter(_: FileStat) {
    return (
        _.filename.endsWith('.mp3') ||
        _.filename.endsWith('.flac') ||
        _.filename.endsWith('.wma')
    );
}

// TODO: 需要支持中断&取消
// 搜索本地的文件列表
async function getMusicFiles(folderPath: string) {
    try {
        const dirFiles = await FileSystem.statDir(folderPath);
        const musicFiles: FileStat[] = [];

        await Promise.all(
            dirFiles.map(async item => {
                if (item.type === 'directory') {
                    const res = await getMusicFiles(item.path);
                    musicFiles.push(...res);
                } else if (localMediaFilter(item)) {
                    musicFiles.push(item);
                }
            }),
        );
        return musicFiles;
    } catch (e: any) {
        errorLog('获取本地文件失败', e?.message);
        return [];
    }
}

// 导入本地音乐
async function importLocal(folderPaths: string[]) {
    const musics = await Promise.all(folderPaths.map(_ => getMusicFiles(_)));
    const musicList = musics.flat();
    const metas = await mp3Util.getMediaMeta(musicList.map(_ => _.path));
    console.log(metas);
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

const LocalMusicSheet = {
    setup,
    addMusic,
    removeMusic,
    importFolder,
    importLocal,
    isLocalMusic,
    useIsLocal,
    getMusicList,
    useMusicList: localSheetStateMapper.useMappedState,
};

export default LocalMusicSheet;
