import { DrawerActions, useNavigation } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { useCallback, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppBar } from '@/components/layout/AppBar';
import { Screen } from '@/components/layout/Screen';
import { showToast } from '@/components/overlay';
import { ContentUnavailable } from '@/components/ui/ContentUnavailable';
import {
    LOCAL_PLAYLIST_TITLE_MAX_LENGTH,
    playlist,
    useLocalPlaylists,
    useStarredPlaylists,
} from '@/core/playlist';
import { layout, space } from '@/design';
import { isCompactHeight } from '@/hooks/useCompactHeight';
import { useT } from '@/i18n';
import { stash } from '@/infra/stash';
import { mediaKey } from '@/utils/media';
import { LocalPlaylistRow } from '@/widgets/LocalPlaylistRow';
import { MediaRow } from '@/widgets/MediaRow';
import { MusicBar } from '@/widgets/MusicBar';
import { showTextPromptPanel } from '@/widgets/overlays/TextPromptPanel';

import { HomeBottomInset } from './components/HomeBottomInset';
import { HomeEntries } from './components/HomeEntries';
import { PlaylistTabs, type PlaylistTab } from './components/PlaylistTabs';
import { SearchEntry } from './components/SearchEntry';

import type { LocalPlaylist, StarredPlaylist } from '@/core/playlist';

/**
 * 歌单区的行数据：本地歌单与收藏歌单用不同的行渲染（后者是插件媒体、带来源 Tag 与更全的副标题），
 * 故按 tab 分派成判别联合，仍喂给同一个 FlashList
 */
type PlaylistRowItem =
    | {
          kind: 'local';
          key: string;
          item: LocalPlaylist;
          onPress: () => void;
      }
    | {
          kind: 'starred';
          key: string;
          item: StarredPlaylist;
          onPress: () => void;
      };

/**
 * 首页：AppBar（菜单 + 只读搜索入口）+ 单个 FlashList（入口网格 + 歌单 Tab 作 header、歌单行虚拟化）+ 底部 MusicBar
 * 首页是资料库页而非内容流：header 只有入口与 Tab，不订阅任何会变的数据，高度稳定
 * 宽屏下 header 与行都限宽 listContentMaxWidth 居中（同 MediaList），手机上不多包一层；
 * 矮窗（手机横屏）也不包——网格铺满 780dp 后四张入口卡由 2 × 2 收成一行，直接省下一整行
 * 抽屉在 app/navigation/HomeDrawer 外包（仅 Home 有抽屉）
 */
export default function HomeScreen() {
    const t = useT();
    const navigation = useNavigation();
    const [tab, setTab] = useState<PlaylistTab>('local');
    const local = useLocalPlaylists();
    const starred = useStarredPlaylists();
    const { width, height } = useWindowDimensions();
    // 只在真的过宽时才包一层：手机上恒等于原来的结构。
    // 矮窗（手机横屏）例外——那里宽度是唯一的余量，限宽换来的留白反而让入口网格多占一行
    const constrain =
        width > layout.listContentMaxWidth && !isCompactHeight(height);

    // 不 memo：行只携带 core 对象与导航回调，文案由行组件各自经 useT 订阅、切语言自行重渲；
    // 本页自身也订阅 useT，故 tab / 歌单 / 语言变化时重渲，就地映射即按需重算
    const rows: PlaylistRowItem[] =
        tab === 'local'
            ? local.map(p => ({
                  kind: 'local' as const,
                  key: p.id,
                  item: p,
                  onPress: () =>
                      navigation.navigate('PlaylistDetail', { id: p.id }),
              }))
            : starred.map(p => ({
                  kind: 'starred' as const,
                  key: mediaKey(p),
                  item: p,
                  // 收藏（远程）歌单 → 插件详情页：DTO 存 stash、只传 ticket（同搜索结果入口）
                  onPress: () => {
                      const ticket = stash(p);
                      navigation.navigate('PluginPlaylistDetail', { ticket });
                  },
              }));

    const renderItem = useCallback(
        ({ item }: { item: PlaylistRowItem }) => {
            const row =
                item.kind === 'starred' ? (
                    <MediaRow
                        type="playlist"
                        item={item.item}
                        onPress={item.onPress}
                    />
                ) : (
                    <LocalPlaylistRow item={item.item} onPress={item.onPress} />
                );
            return constrain ? (
                <View style={styles.constrained}>{row}</View>
            ) : (
                row
            );
        },
        [constrain],
    );

    // 新建本地歌单：输入名 → createLocalPlaylist；成功切本地 tab 让新歌单（反应式出现）可见，失败留面板重试
    // setTab 放创建成功分支内：即便提交中面板被取消/返回关掉，已成功的写入仍切过去；提交前取消则不切
    const createPlaylist = useCallback(() => {
        showTextPromptPanel<string>({
            title: t('home.playlists.createPlaylist'),
            placeholder: t('home.playlists.playlistName'),
            maxLength: LOCAL_PLAYLIST_TITLE_MAX_LENGTH,
            onSubmit: async name => {
                try {
                    const id = await playlist.createLocalPlaylist({
                        title: name.trim(),
                    });
                    setTab('local');
                    return { ok: true, result: id };
                } catch {
                    showToast(t('feedback.operationFailed'), { type: 'error' });
                    return { ok: false };
                }
            },
        });
    }, [t]);

    // EntryCards 自己限宽居中（网格要按限宽后的实测宽算列数），Tab 行在这里包
    const tabs = (
        <PlaylistTabs tab={tab} onTab={setTab} onCreate={createPlaylist} />
    );

    return (
        <Screen edges={[]}>
            <AppBar
                leading={{
                    icon: 'menu',
                    label: t('home.a11y.openDrawer'),
                    onPress: () =>
                        navigation.dispatch(DrawerActions.openDrawer()),
                }}
                center={
                    <SearchEntry
                        onPress={() => navigation.navigate('SearchPage')}
                    />
                }
            />
            <View style={styles.list}>
                <FlashList
                    data={rows}
                    keyExtractor={row => row.key}
                    // 两类行结构不同，分池回收避免切 tab 时复用到不匹配的行
                    getItemType={row => row.kind}
                    renderItem={renderItem}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.content}
                    ListHeaderComponent={
                        <View style={styles.header}>
                            <HomeEntries />
                            {constrain ? (
                                <View style={styles.constrained}>{tabs}</View>
                            ) : (
                                tabs
                            )}
                        </View>
                    }
                    ListEmptyComponent={
                        <ContentUnavailable
                            icon="list-music"
                            title={t('home.playlists.empty')}
                            style={styles.empty}
                        />
                    }
                    ListFooterComponent={<HomeBottomInset />}
                />
            </View>
            <MusicBar />
        </Screen>
    );
}

const styles = StyleSheet.create({
    list: {
        flex: 1,
    },
    content: {
        paddingTop: space.md,
        paddingBottom: space.xl,
    },
    header: {
        gap: space.xl,
        paddingBottom: space.sm,
    },
    /** 宽屏下把行 / Tab 收窄居中；手机上这一层压根不会挂 */
    constrained: {
        width: '100%',
        maxWidth: layout.listContentMaxWidth,
        alignSelf: 'center',
    },
    empty: {
        paddingVertical: space['3xl'],
    },
});
