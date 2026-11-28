import { useRoute, type RouteProp } from '@react-navigation/native';
import { useEffect, useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { claim } from '@/infra/stash';
import { MusicBar } from '@/widgets/MusicBar';
import { MusicCollectionDetail } from '@/widgets/musicCollectionDetail/MusicCollectionDetail';

import { usePluginPlaylistSource } from './hooks/usePluginPlaylistSource';

import type { PlaylistItemBase } from '@/types';

/** 插件歌单详情页路由参数：stash ticket（PlaylistItemBase 含插件私有字段、不可靠序列化，故存 stash 只传取件号） */
export type PluginPlaylistDetailParams = { ticket: string };

/** 插件（远程）歌单详情页：ticket 取回 PlaylistItemBase → 远程 source 组装 → 注入通用 MusicCollectionDetail widget */
export default function PluginPlaylistDetailScreen() {
    const route =
        useRoute<
            RouteProp<
                { PluginPlaylistDetail: PluginPlaylistDetailParams },
                'PluginPlaylistDetail'
            >
        >();
    const { ticket } = route.params;
    // claim 破坏性（读即删）：放提交后的 effect 做、渲染期保持纯净，避开并发渲染被中断重启时的重复领取
    // 键 ticket——同屏 navigate 换 params 时重新领取新歌单
    const [claimed, setClaimed] = useState<{
        ticket: string;
        item: PlaylistItemBase | undefined;
    }>();
    useEffect(() => {
        setClaimed({ ticket, item: claim<PlaylistItemBase>(ticket) });
    }, [ticket]);
    // 尚未领取当前 ticket = pending（按 loading）；领取后 item 仍缺失才是 error
    const matched = claimed?.ticket === ticket ? claimed : undefined;
    const source = usePluginPlaylistSource(matched?.item, !matched);
    // edges 空：top 由 ImmersiveAppBar 独占（封面沉浸伸到状态栏下）；bottom 交给 MusicBar
    return (
        <Screen edges={[]} statusBar={false}>
            <MusicCollectionDetail source={source} />
            <MusicBar />
        </Screen>
    );
}
