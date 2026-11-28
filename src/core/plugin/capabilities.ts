/** 插件能力派生：supportedMethods → 稳定有序的能力语义 token；裁剪/翻译留调用处 */
import type { Plugin, PluginMethods } from './types';

/** 插件能力语义 token（展示用，与方法名解耦；调用处翻译，不返回中文） */
export type PluginCapability =
    | 'search'
    | 'play'
    | 'lyric'
    | 'topList'
    | 'recommend'
    | 'album'
    | 'artist'
    | 'playlist'
    | 'comment'
    | 'musicInfo'
    | 'importMusic'
    | 'importPlaylist';

/** 能力 → 支撑方法（任一实现即视为具备）；数组顺序 = 稳定展示优先级 */
const CAPABILITY_METHODS: readonly (readonly [
    PluginCapability,
    readonly (keyof PluginMethods)[],
])[] = [
    ['search', ['search']],
    ['play', ['getMediaSource']],
    ['lyric', ['getLyric']],
    ['topList', ['getTopLists', 'getTopListDetail']],
    ['recommend', ['getRecommendPlaylistTags', 'getRecommendPlaylistsByTag']],
    ['album', ['getAlbumInfo']],
    ['artist', ['getArtistWorks']],
    ['playlist', ['getPlaylistInfo']],
    ['comment', ['getMusicComments']],
    ['musicInfo', ['getMusicInfo']],
    ['importMusic', ['importMusicItem']],
    ['importPlaylist', ['importPlaylist']],
];

/** supportedMethods → 稳定有序的能力 token 全量（不裁剪、不翻译） */
export function capabilitiesOf(
    supportedMethods: Plugin['supportedMethods'],
): PluginCapability[] {
    return CAPABILITY_METHODS.filter(([, methods]) =>
        methods.some(method => supportedMethods.has(method)),
    ).map(([capability]) => capability);
}
