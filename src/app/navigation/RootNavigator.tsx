import { createNativeStackNavigator } from '@react-navigation/native-stack';

import AudioProbeScreen from '@/dev/AudioProbeScreen';
import ComponentGalleryScreen from '@/dev/ComponentGalleryScreen';
import DownloadProbeScreen from '@/dev/DownloadProbeScreen';
import LocalMusicProbeScreen from '@/dev/LocalMusicProbeScreen';
import PlayerProbeScreen from '@/dev/PlayerProbeScreen';
import PlaylistProbeScreen from '@/dev/PlaylistProbeScreen';
import ReorderableListProbeScreen from '@/dev/ReorderableListProbeScreen';
import SkiaListSpikeScreen from '@/dev/SkiaListSpikeScreen';
import SkiaMediaListProbeScreen from '@/dev/SkiaMediaListProbeScreen';
import SkiaRowCompareScreen from '@/dev/SkiaRowCompareScreen';
import TagProbeScreen from '@/dev/TagProbeScreen';
import AboutScreen from '@/pages/about';
import AppearanceScreen from '@/pages/appearance';
import ArtistDetailScreen from '@/pages/artistDetail';
import BackupRestoreScreen from '@/pages/backupRestore';
import DirectoryBrowserScreen from '@/pages/directoryBrowser';
import DownloadManagerScreen from '@/pages/downloadManager';
import EditLyricScreen from '@/pages/editLyric';
import EditPlaylistInfoScreen from '@/pages/editPlaylistInfo';
import ErrorLogScreen from '@/pages/errorLog';
import HistoryScreen from '@/pages/history';
import LocalCollectionDetailScreen from '@/pages/localCollectionDetail';
import LocalMusicScreen from '@/pages/localMusic';
import MusicCommentsScreen from '@/pages/musicComments';
import MusicDetailScreen from '@/pages/musicDetail';
import MusicSelectionScreen from '@/pages/musicSelection';
import PlaylistDetailScreen from '@/pages/playlistDetail';
import PlaylistEditorScreen from '@/pages/playlistEditor';
import PluginAlbumDetailScreen from '@/pages/pluginAlbumDetail';
import PluginManagerScreen from '@/pages/pluginManager';
import PluginPlaylistDetailScreen from '@/pages/pluginPlaylistDetail';
import PluginSubscriptionsScreen from '@/pages/pluginSubscriptions';
import RecommendPlaylistsScreen from '@/pages/recommendPlaylists';
import RestoreResultScreen from '@/pages/restoreResult';
import ScanSettingsScreen from '@/pages/scanSettings';
import SearchInListScreen from '@/pages/searchInList';
import SearchPageScreen from '@/pages/searchPage';
import SettingsScreen from '@/pages/settings';
import ThemeEditorScreen from '@/pages/themeEditor';
import TopListScreen from '@/pages/topList';
import TopListDetailScreen from '@/pages/topListDetail';

import { HomeDrawer } from './HomeDrawer';

import type { DevStackParamList } from './routes';

// dev 诊断路由并入导航类型，运行时仅 __DEV__ 注册（见下）
const Stack = createNativeStackNavigator<DevStackParamList>();

/** 根导航：生产屏 + __DEV__ 诊断路由；各轮在此注册新屏 */
export function RootNavigator() {
    return (
        <Stack.Navigator
            screenOptions={{
                headerShown: false,
                animation: 'slide_from_right',
            }}
        >
            <Stack.Screen name="Home" component={HomeDrawer} />
            <Stack.Screen name="SearchPage" component={SearchPageScreen} />
            <Stack.Screen name="History" component={HistoryScreen} />
            <Stack.Screen name="LocalMusic" component={LocalMusicScreen} />
            <Stack.Screen
                name="LocalCollectionDetail"
                component={LocalCollectionDetailScreen}
            />
            <Stack.Screen
                name="DirectoryBrowser"
                component={DirectoryBrowserScreen}
            />
            <Stack.Screen name="ScanSettings" component={ScanSettingsScreen} />
            <Stack.Screen name="MusicDetail" component={MusicDetailScreen} />
            <Stack.Screen
                name="MusicComments"
                component={MusicCommentsScreen}
            />
            <Stack.Screen
                name="PlaylistDetail"
                component={PlaylistDetailScreen}
            />
            <Stack.Screen
                name="PlaylistEditor"
                component={PlaylistEditorScreen}
            />
            <Stack.Screen
                name="EditPlaylistInfo"
                component={EditPlaylistInfoScreen}
            />
            <Stack.Screen name="EditLyric" component={EditLyricScreen} />
            <Stack.Screen
                name="MusicSelection"
                component={MusicSelectionScreen}
            />
            <Stack.Screen
                name="PluginAlbumDetail"
                component={PluginAlbumDetailScreen}
            />
            <Stack.Screen
                name="PluginPlaylistDetail"
                component={PluginPlaylistDetailScreen}
            />
            <Stack.Screen
                name="PluginManager"
                component={PluginManagerScreen}
            />
            <Stack.Screen
                name="PluginSubscriptions"
                component={PluginSubscriptionsScreen}
            />
            <Stack.Screen name="TopList" component={TopListScreen} />
            <Stack.Screen
                name="TopListDetail"
                component={TopListDetailScreen}
            />
            <Stack.Screen
                name="RecommendPlaylists"
                component={RecommendPlaylistsScreen}
            />
            <Stack.Screen name="ArtistDetail" component={ArtistDetailScreen} />
            <Stack.Screen name="SearchInList" component={SearchInListScreen} />
            <Stack.Screen
                name="BackupRestore"
                component={BackupRestoreScreen}
            />
            <Stack.Screen
                name="DownloadManager"
                component={DownloadManagerScreen}
            />
            <Stack.Screen
                name="RestoreResult"
                component={RestoreResultScreen}
            />
            <Stack.Screen name="Appearance" component={AppearanceScreen} />
            <Stack.Screen name="ThemeEditor" component={ThemeEditorScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="About" component={AboutScreen} />
            <Stack.Screen name="ErrorLog" component={ErrorLogScreen} />
            {__DEV__ && (
                <Stack.Screen
                    name="DevAudioProbe"
                    component={AudioProbeScreen}
                />
            )}
            {__DEV__ && (
                <Stack.Screen
                    name="DevComponentGallery"
                    component={ComponentGalleryScreen}
                />
            )}
            {__DEV__ && (
                <Stack.Screen
                    name="DevPlayerProbe"
                    component={PlayerProbeScreen}
                />
            )}
            {__DEV__ && (
                <Stack.Screen
                    name="DevPlaylistProbe"
                    component={PlaylistProbeScreen}
                />
            )}
            {__DEV__ && (
                <Stack.Screen name="DevTagProbe" component={TagProbeScreen} />
            )}
            {__DEV__ && (
                <Stack.Screen
                    name="DevLocalMusicProbe"
                    component={LocalMusicProbeScreen}
                />
            )}
            {__DEV__ && (
                <Stack.Screen
                    name="DevReorderableListProbe"
                    component={ReorderableListProbeScreen}
                />
            )}
            {__DEV__ && (
                <Stack.Screen
                    name="DevSkiaListSpike"
                    component={SkiaListSpikeScreen}
                />
            )}
            {__DEV__ && (
                <Stack.Screen
                    name="DevSkiaRowCompare"
                    component={SkiaRowCompareScreen}
                />
            )}
            {__DEV__ && (
                <Stack.Screen
                    name="DevSkiaMediaListProbe"
                    component={SkiaMediaListProbeScreen}
                />
            )}
            {__DEV__ && (
                <Stack.Screen
                    name="DevDownloadProbe"
                    component={DownloadProbeScreen}
                />
            )}
        </Stack.Navigator>
    );
}
