import pathConst from '@/constants/pathConst';
import FastImage from 'react-native-fast-image';
import {
    copyFile,
    downloadFile,
    exists,
    mkdir,
    PicturesDirectoryPath,
    readDir,
    unlink,
    writeFile,
} from 'react-native-fs';
import {errorLog} from './log';
import path from 'path-browserify';

export const galleryBasePath = `${PicturesDirectoryPath}/MusicFree/`;

export async function saveToGallery(src: string) {
    const fileName = `${galleryBasePath}${Date.now()}.png`;
    if (!(await exists(galleryBasePath))) {
        await mkdir(galleryBasePath);
    }
    if (await exists(src)) {
        try {
            await copyFile(src, fileName);
        } catch (e) {
            console.log('... ', e);
        }
    }
    if (src.startsWith('http')) {
        await downloadFile({
            fromUrl: src,
            toFile: fileName,
            background: true,
        });
    }
    if (src.startsWith('data')) {
        await writeFile(fileName, src);
    }
}

export function sizeFormatter(bytes: number | string) {
    if (typeof bytes === 'string') {
        return bytes;
    }
    if (bytes === 0) return '0B';
    let k = 1024,
        sizes = ['B', 'KB', 'MB', 'GB'],
        i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + sizes[i];
}

export async function checkAndCreateDir(path: string) {
    const filePath = path;
    try {
        if (!(await exists(filePath))) {
            await mkdir(filePath);
        }
    } catch (e) {
        errorLog('无法初始化目录', {path, e});
    }
}

async function getFolderSize(path: string): Promise<number> {
    let size = 0;
    try {
        const fns = await readDir(path);
        for (let fn of fns) {
            if (fn.isFile()) {
                size += fn.size;
            }
            // todo: 可以改成并行 promise.all
            if (fn.isDirectory()) {
                size += await getFolderSize(fn.path);
            }
        }
    } catch {}
    return size;
}

export async function getCacheSize(
    type: 'music' | 'lyric' | 'image',
): Promise<number> {
    if (type === 'music') {
        return getFolderSize(pathConst.musicCachePath);
    } else if (type === 'lyric') {
        return getFolderSize(pathConst.lrcCachePath);
    } else if (type === 'image') {
        return getFolderSize(pathConst.imageCachePath);
    }
    throw new Error();
}

export async function clearCache(type: 'music' | 'lyric' | 'image') {
    if (type === 'music') {
        try {
            if (await exists(pathConst.musicCachePath)) {
                return unlink(pathConst.musicCachePath);
            }
        } catch {}
    } else if (type === 'lyric') {
        try {
            const lrcs = readDir(pathConst.lrcCachePath);
            return Promise.all((await lrcs).map(_ => unlink(_.path)));
        } catch {}
    } else if (type === 'image') {
        return FastImage.clearDiskCache();
    }
}

export function addFileScheme(fileName: string) {
    if (fileName.startsWith('/')) {
        return `file://${fileName}`;
    }
    return fileName;
}

export function addRandomHash(url: string) {
    if (url.indexOf('#') === -1) {
        return `${url}#${Date.now()}`;
    }
    return url;
}

export function trimHash(url: string) {
    const index = url.lastIndexOf('#');
    if (index === -1) {
        return url;
    }
    return url.substring(0, index);
}

export function escapeCharacter(str?: string) {
    return str !== undefined ? `${str}`.replace(/\//g, '_') : '';
}

export function getDirectory(path: string) {
    const lastSlash = path.lastIndexOf('/');
    if (lastSlash === -1) {
        return path;
    }
    return path.slice(0, lastSlash);
}

export async function mkdirR(directory: string) {
    let folder = directory;
    const checkStack = [];
    while (folder.length > 15) {
        checkStack.push(folder);
        folder = path.dirname(folder);
    }
    let existPos = 0;
    for (let i = 0; i < checkStack.length; ++i) {
        const isExist = await exists(checkStack[i]);
        if (isExist) {
            existPos = i;
            break;
        }
    }

    for (let j = existPos - 1; j >= 0; --j) {
        try {
            await mkdir(checkStack[j]);
        } catch (e) {
            console.log('error', e);
        }
    }
}
