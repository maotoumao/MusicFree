import ArtistDetail from '@/pages/artistDetail';
import Downloading from '@/pages/downloading';
import LocalMusic from '@/pages/localMusic';
import MusicListEditor from '@/pages/musicListEditor';
import SearchMusicList from '@/pages/searchMusicList';
import AlbumDetail from '../pages/albumDetail';
import Home from '../pages/home';
import MusicDetail from '../pages/musicDetail';
import SearchPage from '../pages/searchPage';
import Setting from '../pages/setting';
import SheetDetail from '../pages/sheetDetail';

/** 路由key */
const ROUTE_PATH = {
    /** 主页 */
    HOME: 'home',
    /** 音乐播放页 */
    MUSIC_DETAIL: 'music-detail',
    /** 搜索页 */
    SEARCH_PAGE: 'search-page',
    /** 歌单页 */
    SHEET_DETAIL: 'sheet-detail',
    /** 专辑页 */
    ALBUM_DETAIL: 'album-detail',
    /** 歌手页 */
    ARTIST_DETAIL: 'artist-detail',
    /** 设置页 */
    SETTING: 'setting',
    /** 本地下载 */
    LOCAL: 'local',
    /** 正在下载 */
    DOWNLOADING: 'downloading',
    /** 从歌曲列表中搜索 */
    SEARCH_MUSIC_LIST: 'search-music-list',
    /** 批量编辑 */
    MUSIC_LIST_EDITOR: 'music-list-editor',
} as const;

type Valueof<T> = T[keyof T];

type IRoutes = {
    path: Valueof<typeof ROUTE_PATH>;
    component: (...args: any[]) => JSX.Element;
};

const routes: Array<IRoutes> = [
    {
        path: ROUTE_PATH.HOME,
        component: Home,
    },
    {
        path: ROUTE_PATH.MUSIC_DETAIL,
        component: MusicDetail,
    },
    {
        path: ROUTE_PATH.SEARCH_PAGE,
        component: SearchPage,
    },
    {
        path: ROUTE_PATH.SHEET_DETAIL,
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
];

export {routes, ROUTE_PATH};

export type RootStackParamList = {
    home: undefined;
    'music-detail': undefined;
    'search-page': undefined;
    'sheet-detail': undefined;
    'album-detail': undefined;
    'artist-detail': undefined;
    setting: {
        type: string;
    };
    local: undefined;
    downloading: undefined;
    'search-music-list': {
        musicList: IMusic.IMusicItem[];
    };
};
