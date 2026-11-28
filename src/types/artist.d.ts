import type { MediaBase } from './media';

/** 歌手作品可查的媒体类型（仅 music / album） */
export type ArtistMediaType = 'music' | 'album';

/** 歌手（作品经 getArtistWorks 分页拉取，故无内嵌 list 形态） */
export interface ArtistItem extends MediaBase {
    name: string;
    avatar?: string;
    fans?: number;
    description?: string;
    worksNum?: number;
}
