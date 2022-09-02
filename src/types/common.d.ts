declare namespace ICommon {
    /** 支持搜索的媒体类型 */
    export type SupportMediaType = 'music' | 'album' | 'artist'

    /** 媒体定义 */
    export type SupportMediaItemBase = {
        music: IMusic.IMusicItemBase,
        album: IAlbum.IAlbumItemBase,
        artist: IArtist.IArtistItemBase
    }
}