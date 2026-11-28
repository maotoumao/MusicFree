import type { MediaBase } from './media';
import type { MusicItem } from './music';

/** 专辑（列表/搜索形态，无内嵌 musicList） */
export interface AlbumItemBase extends MediaBase {
    title: string;
    artist?: string;
    artwork?: string;
    /** 发行日期 */
    date?: string;
    description?: string;
    worksNum?: number;
}

/** 专辑（详情形态，含曲目列表） */
export interface AlbumItem extends AlbumItemBase {
    musicList: MusicItem[];
}
