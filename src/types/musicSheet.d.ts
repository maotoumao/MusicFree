declare namespace IMusic {
    /**
     * 歌单订阅源
     *
     * 记录「这个歌单是从哪来的」，之后才能按原链接重新拉取。
     * 全部字段可选，保证旧数据反序列化不炸。
     */
    export interface ISubscription {
        /** 原始分享链接，如 https://music.163.com/#/playlist?id=xxx */
        url: string;
        /** 来源插件的 platform 值，用于回查插件 */
        platform: string;
        /** 从 url 解析出的源站歌单 id，便于比对是否换源 */
        sheetIdInSource?: string;
        /** 上次成功同步的时间戳（毫秒） */
        lastSyncAt?: number;
        lastSyncStatus?: "success" | "failed" | "partial";
        lastSyncError?: string;
        /** 是否参与自动同步 */
        autoSync?: boolean;
        /** append=只追加；mirror=跟随源端增删 */
        syncMode?: "append" | "mirror";
        /** 上次同步新增条数 */
        addedCount?: number;
        /** 上次同步发现源端已下架的条数 */
        missingCount?: number;
    }

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
        /** 订阅源：有值才说明这个歌单可同步 */
        subscription?: ISubscription;
        [k: string]: any;
    }
    /** 歌单项 */
    export interface IMusicSheetItem extends IMusicSheetItemBase {
        musicList: Array<IMusic.IMusicItem>;
    }

    export type IMusicSheet = Array<IMusicSheetItem>;
}
