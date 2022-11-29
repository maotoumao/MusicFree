export const internalSymbolKey = Symbol.for('$');
export const internalSerializeKey = '$';
export const localMusicSheetId = 'local-music-sheet';

export const localPluginPlatform = '本地';
export const localPluginHash = 'local-plugin-hash';

export const internalFakeSoundKey = 'fake-key';

const emptyFunction = () => {};
Object.freeze(emptyFunction);
export {emptyFunction};

/** 音质 */
export enum Quality {
    /** 标准 */
    Standard = 'st',
    /** 高音质 */
    HighQuality = 'hi',
    /** 超高音质 */
    SuperQuality = 'su',
}

export const QualityList = [
    Quality.Standard,
    Quality.HighQuality,
    Quality.SuperQuality,
];

export const QualityText = {
    [Quality.Standard]: '标准',
    [Quality.HighQuality]: '高音质',
    [Quality.SuperQuality]: '超高音质',
};

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
