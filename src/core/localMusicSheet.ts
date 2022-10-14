import {internalSerialzeKey, StorageKeys} from '@/constants/commonConst';
import mp3Util, {IBasicMeta} from '@/native/mp3Util';
import {isSameMediaItem} from '@/utils/mediaItem';
import StateMapper from '@/utils/stateMapper';
import {getStorage, setStorage} from '@/utils/storage';
import {FileSystem} from 'react-native-file-access';

let localSheet: IMusic.IMusicItem[] = [];
const localSheetStateMapper = new StateMapper(() => localSheet);

export async function setup() {
    const sheets = await getStorage(StorageKeys.LocalMusicSheet);
    if (sheets) {
        localSheet = sheets;
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
        if (deleteOriginalFile && musicItem[internalSerialzeKey]?.localPath) {
            await FileSystem.unlink(musicItem[internalSerialzeKey].localPath);
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

export async function importFolder(folderPath: string) {
    const dirFiles = await FileSystem.statDir(folderPath);
    const musicFiles = dirFiles.filter(
        _ => _.type === 'file' && _.filename.endsWith('.mp3'),
    );

    const musicItems: IMusic.IMusicItem[] = await Promise.all(
        musicFiles.map(async mf => {
            let {platform, id, title, artist} =
                parseFilename(mf.filename) ?? {};

            const decodedPath = decodeURIComponent(mf.path);
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
                title: title ?? meta?.title ?? '未知名称',
                artist: artist ?? meta?.artist ?? '未知歌手',
                duration: parseInt(meta?.duration ?? '0') / 1000,
                album: meta?.album ?? '',
                artwork: '',
                [internalSerialzeKey]: {
                    localPath: decodedPath,
                },
            };
        }),
    );
    addMusic(musicItems);
}