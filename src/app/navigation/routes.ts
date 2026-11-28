import type { ArtistDetailParams } from '@/pages/artistDetail';
import type { DirectoryBrowserParams } from '@/pages/directoryBrowser';
import type { EditLyricParams } from '@/pages/editLyric';
import type { EditPlaylistInfoParams } from '@/pages/editPlaylistInfo';
import type { LocalCollectionDetailParams } from '@/pages/localCollectionDetail';
import type { MusicCommentsParams } from '@/pages/musicComments';
import type { MusicSelectionParams } from '@/pages/musicSelection';
import type { PlaylistDetailParams } from '@/pages/playlistDetail';
import type { PlaylistEditorParams } from '@/pages/playlistEditor';
import type { PluginAlbumDetailParams } from '@/pages/pluginAlbumDetail';
import type { PluginPlaylistDetailParams } from '@/pages/pluginPlaylistDetail';
import type { RestoreResultParams } from '@/pages/restoreResult';
import type { ScanSettingsParams } from '@/pages/scanSettings';
import type { SearchInListParams } from '@/pages/searchInList';
import type { SettingsParams } from '@/pages/settings';
import type { ThemeEditorParams } from '@/pages/themeEditor';
import type { TopListDetailParams } from '@/pages/topListDetail';

/** 生产路由注册表：新增路由 = 在此加一行 + 建对应屏；带参路由的参数类型由对应页 own、在此 import 组装（经下方全局增强供 useNavigation 类型） */
type RootStackParamList = {
    Home: undefined;
    SearchPage: undefined;
    History: undefined;
    LocalMusic: undefined;
    LocalCollectionDetail: LocalCollectionDetailParams;
    DirectoryBrowser: DirectoryBrowserParams;
    ScanSettings: ScanSettingsParams;
    PluginManager: undefined;
    PluginSubscriptions: undefined;
    DownloadManager: undefined;
    MusicDetail: undefined;
    MusicComments: MusicCommentsParams;
    PlaylistDetail: PlaylistDetailParams;
    PlaylistEditor: PlaylistEditorParams;
    EditPlaylistInfo: EditPlaylistInfoParams;
    EditLyric: EditLyricParams;
    MusicSelection: MusicSelectionParams;
    PluginAlbumDetail: PluginAlbumDetailParams;
    PluginPlaylistDetail: PluginPlaylistDetailParams;
    TopList: undefined;
    TopListDetail: TopListDetailParams;
    RecommendPlaylists: undefined;
    ArtistDetail: ArtistDetailParams;
    SearchInList: SearchInListParams;
    BackupRestore: undefined;
    RestoreResult: RestoreResultParams;
    Appearance: undefined;
    ThemeEditor: ThemeEditorParams;
    Settings: SettingsParams | undefined;
    About: undefined;
    ErrorLog: undefined;
};

/** dev 诊断路由：仅 __DEV__ 由 app/navigation 注册，不并入生产公开契约 */
export type DevStackParamList = RootStackParamList & {
    DevAudioProbe: undefined;
    DevComponentGallery: undefined;
    DevPlayerProbe: undefined;
    DevPlaylistProbe: undefined;
    DevTagProbe: undefined;
    DevLocalMusicProbe: undefined;
    DevReorderableListProbe: undefined;
    DevSkiaListSpike: undefined;
    DevSkiaRowCompare: undefined;
    DevSkiaMediaListProbe: undefined;
    DevDownloadProbe: undefined;
};

// 全局类型增强：useNavigation() 等在全项目类型安全，页面无需反向 import 本文件的路由类型
declare global {
    namespace ReactNavigation {
        interface RootParamList extends RootStackParamList {}
    }
}
