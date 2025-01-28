import { useNavigation, useRoute } from "@react-navigation/native";
import { useCallback } from "react";
import { RoutePaths } from "@/constants/routeConst.ts";

type RouterParamsBase = Record<RoutePaths, any>;
/** 路由参数 */
interface RouterParams extends RouterParamsBase {
  home: undefined;
  'music-detail': undefined;
  'search-page': undefined;
  'local-sheet-detail': {
    id: string;
  };
  'album-detail': {
    albumItem: IAlbum.IAlbumItem;
  };
  'artist-detail': {
    artistItem: IArtist.IArtistItem;
    pluginHash: string;
  };
  setting: {
    type: string;
    // anchor?: string | number;
  };
  local: undefined;
  downloading: undefined;
  'search-music-list': {
    musicList: IMusic.IMusicItem[] | null;
    musicSheet?: IMusic.IMusicSheetItem;
  };
  'music-list-editor': {
    musicSheet?: Partial<IMusic.IMusicSheetItem>;
    musicList: IMusic.IMusicItem[] | null;
  };
  'file-selector': {
    fileType?: 'folder' | 'file' | 'file-and-folder'; // 10: folder 11: file and folder,
    multi?: boolean; // 是否多选
    actionText?: string; // 底部行动点的文本
    actionIcon?: string; // 底部行动点的图标
    onAction?: (
      selectedFiles: {
        path: string;
        type: 'file' | 'folder';
      }[],
    ) => Promise<boolean>; // true会自动关闭，false会停在当前页面
    matchExtension?: (path: string) => boolean;
  };
  'top-list-detail': {
    pluginHash: string;
    topList: IMusic.IMusicSheetItemBase;
  };
  'plugin-sheet-detail': {
    pluginHash?: string;
    sheetInfo: IMusic.IMusicSheetItemBase;
  };
}

/** 路由参数Hook */
export function useParams<T extends RoutePaths>(): RouterParams[T] {
  const route = useRoute<any>();

  return route?.params as RouterParams[T];
}

/** 导航 */
export function useNavigate() {
  const navigation = useNavigation<any>();

  return useCallback(function <T extends RoutePaths>(
      route: T,
      params?: RouterParams[T],
    ) {
      navigation.navigate(route, params);
    },
    []);
}
