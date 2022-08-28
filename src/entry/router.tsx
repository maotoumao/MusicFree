import LocalMusic from '@/pages/localMusic';
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
  /** 设置页 */
  SETTING: 'setting',
  /** 本地下载 */
  LOCAL: 'local'
};

type IRoutes = {
  path: string;
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
    path: ROUTE_PATH.SETTING,
    component: Setting,
  },
  {
    path: ROUTE_PATH.LOCAL,
    component: LocalMusic
  }
];

export {routes, ROUTE_PATH};
