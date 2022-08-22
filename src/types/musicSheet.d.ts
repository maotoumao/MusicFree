declare namespace IMusic {
    /** 歌单项 */
    export interface IMusicSheetItem {
        /** 封面图 */
        coverImg?: string;
        /** 标题 */
        title: string;
        /** 歌曲列表 */
        musicList: Array<IMusic.IMusicItem>;
        /** 歌单id */
        id: string;
        
    }

    export type IMusicSheet = Array<IMusicSheetItem>;
}