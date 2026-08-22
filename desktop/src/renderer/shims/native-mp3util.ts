/**
 * @/native/mp3Util 桌面端实现
 * 通过 IPC 调用主进程 music-metadata(等价 Android 原生 Mp3Util)。
 */

const bridge = (window as any).__MUSICFREE_DESKTOP__;

export interface IBasicMeta {
    album?: string;
    artist?: string;
    author?: string;
    duration?: string;
    title?: string;
}

export interface IWritableMeta extends IBasicMeta {
    lyric?: string;
    comment?: string;
}

const Mp3Util = {
    getBasicMeta: (fileName: string): Promise<IBasicMeta> =>
        bridge.tag.getBasicMeta(fileName),

    getMediaMeta: (fileNames: string[]): Promise<IBasicMeta[]> =>
        bridge.tag.getMediaMeta(fileNames),

    getMediaCoverImg: (mediaPath: string): Promise<string> =>
        bridge.tag.getMediaCoverImg(mediaPath),

    getLyric: (mediaPath: string): Promise<string> =>
        bridge.tag.getLyric(mediaPath),

    setMediaTag: (filePath: string, meta: IWritableMeta): Promise<void> =>
        bridge.tag.setMediaTag(filePath, meta),

    getMediaTag: (filePath: string): Promise<IWritableMeta> =>
        bridge.tag.getMediaTag(filePath),
};

export default Mp3Util;
