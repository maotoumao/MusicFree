import { useRoute, type RouteProp } from '@react-navigation/native';

import { Screen } from '@/components/layout/Screen';
import { MusicBar } from '@/widgets/MusicBar';
import { MusicCollectionDetail } from '@/widgets/musicCollectionDetail/MusicCollectionDetail';

import { useLocalPlaylistSource } from './hooks/useLocalPlaylistSource';

/** 本地歌单详情页的路由参数：歌单 id（favorite 用 FAVORITE_PLAYLIST_ID）；本页 own、routes.ts 组装进路由表 */
export type PlaylistDetailParams = { id: string };

/** 本地歌单详情页：路由传歌单 id → 本地 source 组装 → 注入通用 MusicCollectionDetail widget */
export default function PlaylistDetailScreen() {
    const route =
        useRoute<
            RouteProp<
                { PlaylistDetail: PlaylistDetailParams },
                'PlaylistDetail'
            >
        >();
    const source = useLocalPlaylistSource(route.params.id);
    // edges 空：top 由 ImmersiveAppBar 独占（封面沉浸伸到状态栏下）；bottom 交给 MusicBar（在流内自承接安全区，缺席时由列表底部 padding 兜底）
    return (
        <Screen edges={[]} statusBar={false}>
            <MusicCollectionDetail source={source} />
            <MusicBar />
        </Screen>
    );
}
