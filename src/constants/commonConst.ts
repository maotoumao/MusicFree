export const internalSymbolKey = Symbol.for('$');
export const internalSerialzeKey = '$';
export const tabName = {
    music: '单曲',
    album: '专辑',
    artist: '作者',
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
    MediaMeta: 'media-meta-keys',
    MediaCache: 'media-cache',
};
