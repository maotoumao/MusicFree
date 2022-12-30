declare namespace IMusic {
    export interface IMusicTopListItem {
        /** 封面图 */
        coverImg?: string;
        /** 标题 */
        title: string;
        /** 歌单id */
        id: string;
        /** 描述 */
        description: string;
    }
    /** 歌单项 */
    export interface IMusicTopListGroupItem {
        title?: string;
        data: Array<IMusicTopListItem>;
    }
}
