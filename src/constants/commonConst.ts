export const internalKey =  Symbol.for('internal');
export const tabName = {
    'music': '单曲',
    'album': '专辑',
    'artist': '作者'
}

export enum RequestStateCode {
    /** 检索第一页 */
    IDLE = 0,
    PENDING_FP = 1,
    /** 检索中 */
    PENDING = 2,
    /** 部分结束 */
    PARTLY_DONE = 4,
    /** 全部结束 */
    FINISHED = 5,
  }