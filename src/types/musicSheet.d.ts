declare namespace IMusic {
    export interface IMusicSheetItemBase {
        /** 封面图 */
        coverImg?: string;
        artwork?: string;
        /** 标题 */
        title?: string;
        /** 作者 */
        artist?: string;
        /** 歌单id */
        id: string;
        /** 描述 */
        description?: string;
        /** 作品总数 */
        worksNum?: number;
        platform: string;
        [k: string]: any;
    }
    /** 歌单项 */
    export interface IMusicSheetItem extends IMusicSheetItemBase {
        musicList: Array<IMusic.IMusicItem>;
    }

    export type IMusicSheet = Array<IMusicSheetItem>;
}
