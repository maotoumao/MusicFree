import type { MediaBase } from './media';
import type { MusicItem } from './music';

/**
 * 歌单（列表/搜索形态，无内嵌 musicList）
 * 注：「歌单」概念在插件 wire 里历史称 "musicSheet"，类型层统一用 Playlist
 */
export interface PlaylistItemBase extends MediaBase {
    title?: string;
    artist?: string;
    artwork?: string;
    /** @deprecated 用 artwork；legacy 封面字段，兼容老插件 */
    coverImg?: string;
    description?: string;
    worksNum?: number;
    /** 播放次数（桌面版超集字段） */
    playCount?: number;
    /** 创建时间戳（桌面版超集字段） */
    createdAt?: number;
    /**
     * @deprecated 用 createdAt；wire 旧拼写，老插件与桌面端仍发这个
     * 读边界（core/plugin normalizer、备份解析）已归一到 createdAt，业务代码只读 createdAt
     * TODO 插件生态与桌面端都改发 createdAt 后删除本字段
     */
    createAt?: number;
}

/** 歌单（详情形态，含曲目列表） */
export interface PlaylistItem extends PlaylistItemBase {
    musicList: MusicItem[];
}

/** 一组歌单（榜单分类 / 推荐分组） */
export interface PlaylistGroup {
    title?: string;
    data: PlaylistItemBase[];
}
