import Home from "@/pages/home";
import MusicDetail from "@/pages/musicDetail";
import TopList from "@/pages/topList";
import TopListDetail from "@/pages/topListDetail";
import SearchPage from "@/pages/searchPage";
import SheetDetail from "@/pages/sheetDetail";
import AlbumDetail from "@/pages/albumDetail";
import ArtistDetail from "@/pages/artistDetail";
import Setting from "@/pages/setting";
import LocalMusic from "@/pages/localMusic";
import Downloading from "@/pages/downloading";
import SearchMusicList from "@/pages/searchMusicList";
import MusicListEditor from "@/pages/musicListEditor";
import FileSelector from "@/pages/fileSelector";
import RecommendSheets from "@/pages/recommendSheets";
import PluginSheetDetail from "@/pages/pluginSheetDetail";
import History from "@/pages/history";
import SetCustomTheme from "@/pages/setCustomTheme";
import Permissions from "@/pages/permissions";
import { ROUTE_PATH } from "@/core/router/index.ts";

type ValueOf<T> = T[keyof T];
export type RoutePaths = ValueOf<typeof ROUTE_PATH>;

type IRoutes = {
  path: RoutePaths;
  component: (...args: any[]) => JSX.Element;
};


export const routes: Array<IRoutes> = [
    {
        path: ROUTE_PATH.HOME,
        component: Home,
    },
    {
        path: ROUTE_PATH.MUSIC_DETAIL,
        component: MusicDetail,
    },
    {
        path: ROUTE_PATH.TOP_LIST,
        component: TopList,
    },
    {
        path: ROUTE_PATH.TOP_LIST_DETAIL,
        component: TopListDetail,
    },
    {
        path: ROUTE_PATH.SEARCH_PAGE,
        component: SearchPage,
    },
    {
        path: ROUTE_PATH.LOCAL_SHEET_DETAIL,
        component: SheetDetail,
    },
    {
        path: ROUTE_PATH.ALBUM_DETAIL,
        component: AlbumDetail,
    },
    {
        path: ROUTE_PATH.ARTIST_DETAIL,
        component: ArtistDetail,
    },
    {
        path: ROUTE_PATH.SETTING,
        component: Setting,
    },
    {
        path: ROUTE_PATH.LOCAL,
        component: LocalMusic,
    },
    {
        path: ROUTE_PATH.DOWNLOADING,
        component: Downloading,
    },
    {
        path: ROUTE_PATH.SEARCH_MUSIC_LIST,
        component: SearchMusicList,
    },
    {
        path: ROUTE_PATH.MUSIC_LIST_EDITOR,
        component: MusicListEditor,
    },
    {
        path: ROUTE_PATH.FILE_SELECTOR,
        component: FileSelector,
    },
    {
        path: ROUTE_PATH.RECOMMEND_SHEETS,
        component: RecommendSheets,
    },
    {
        path: ROUTE_PATH.PLUGIN_SHEET_DETAIL,
        component: PluginSheetDetail,
    },
    {
        path: ROUTE_PATH.HISTORY,
        component: History,
    },
    {
        path: ROUTE_PATH.SET_CUSTOM_THEME,
        component: SetCustomTheme,
    },
    {
        path: ROUTE_PATH.PERMISSIONS,
        component: Permissions,
    },
];
