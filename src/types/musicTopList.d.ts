declare namespace IMusic {
    export type IMusicTopListItem = IMusicSheetItemBase;
    /** 歌单项 */
    export interface IMusicTopListGroupItem {
        title?: string;
        data: Array<IMusicTopListItem>;
    }
}
