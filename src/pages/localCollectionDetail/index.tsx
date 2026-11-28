import { useRoute, type RouteProp } from '@react-navigation/native';

import { Screen } from '@/components/layout/Screen';
import { MusicBar } from '@/widgets/MusicBar';
import { MusicCollectionDetail } from '@/widgets/musicCollectionDetail/MusicCollectionDetail';

import { useLocalCollectionSource } from './hooks/useLocalCollectionSource';

import type { LocalCollectionView } from '@/core/localMusic';

/** 本地集合详情路由参数：view + 集合稳定 key + 展示标题（均可序列化、直接传参，不走 stash） */
export type LocalCollectionDetailParams = {
    view: LocalCollectionView;
    /** 集合稳定 key：文件夹 path / 专辑复合 key / 艺术家名（命名避开 React key） */
    collectionKey: string;
    title: string;
};

/**
 * 本地集合详情：按 view + key 取该文件夹/专辑/歌手的曲目，复用通用 MusicCollectionDetail
 * edges 空 + statusBar 透明：封面头由 ImmersiveAppBar 独占顶部；底部交给 MusicBar
 */
export default function LocalCollectionDetailScreen() {
    const route =
        useRoute<
            RouteProp<
                { LocalCollectionDetail: LocalCollectionDetailParams },
                'LocalCollectionDetail'
            >
        >();
    const { view, collectionKey, title } = route.params;
    const source = useLocalCollectionSource(view, collectionKey, title);

    return (
        <Screen edges={[]} statusBar={false}>
            <MusicCollectionDetail source={source} />
            <MusicBar />
        </Screen>
    );
}
