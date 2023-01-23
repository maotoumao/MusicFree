export const internalSymbolKey = Symbol.for('$');
export const internalSerializeKey = '$';
export const localMusicSheetId = 'local-music-sheet';

export const localPluginPlatform = '本地';
export const localPluginHash = 'local-plugin-hash';

export const internalFakeSoundKey = 'fake-key';

const emptyFunction = () => {};
Object.freeze(emptyFunction);
export {emptyFunction};

export enum RequestStateCode {
    /** 空闲 */
    IDLE = 0,
    /** 检索首页 */
    PENDING_FP = 1,
    /** 检索中 */
    PENDING = 2,
    /** 部分结束 */
    PARTLY_DONE = 4,
    /** 全部结束 */
    FINISHED = 5,
}

export const StorageKeys = {
    MediaMetaKeys: 'media-meta-keys',
    PluginMetaKey: 'plugin-meta',
    MediaCache: 'media-cache',
    LocalMusicSheet: 'local-music-sheet',
};

export const CacheControl = {
    Cache: 'cache',
    NoCache: 'no-cache',
    NoStore: 'no-store',
};

export const supportLocalMediaType = [
    '.mp3',
    '.flac',
    '.wma',
    '.wav',
    '.m4a',
    '.ogg',
    '.acc',
    '.aac',
    '.ape',
    '.opus',
];
