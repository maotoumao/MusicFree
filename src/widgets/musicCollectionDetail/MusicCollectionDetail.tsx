import { useNavigation } from '@react-navigation/native';
import { useAtomValue } from 'jotai';
import { useCallback, useMemo } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import {
    useAnimatedScrollHandler,
    useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBar } from '@/components/layout/AppBar';
import { ContentColumn } from '@/components/layout/ContentColumn';
import { ImmersiveAppBar } from '@/components/layout/ImmersiveAppBar';
import { MediaList } from '@/components/ui/MediaList';
import { Text } from '@/components/ui/Text';
import { player } from '@/core/player';
import { chromeIsDarkAtom, space } from '@/design';
import { useBackAction } from '@/hooks/useBackAction';
import { useContentGutter } from '@/hooks/useContentColumn';
import { useLayoutClass } from '@/hooks/useLayoutClass';
import { useT } from '@/i18n';
import { stash } from '@/infra/stash';
import { mediaKey } from '@/utils/media';
import { useCurrentMusicKey } from '@/widgets/hooks/useCurrentMusicKey';
import { MusicRow } from '@/widgets/MusicRow';
import { showActionSheetPanel } from '@/widgets/overlays/ActionSheetPanel';
import { showAddToPlaylistPanel } from '@/widgets/overlays/AddToPlaylistPanel';
import { showMediaDescriptionPanel } from '@/widgets/overlays/MediaDescriptionPanel';
import { showMusicItemOptionsPanel } from '@/widgets/overlays/MusicItemOptionsPanel';
import { PlayAllBar } from '@/widgets/PlayAllBar';

import { CollectionHeader, COVER_HEIGHT } from './components/CollectionHeader';
import { CollectionSidePane } from './components/CollectionSidePane';

import type { CollectionMenuAction, MusicCollectionDetailProps } from './types';
import type { ImmersiveAppBarAction } from '@/components/layout/ImmersiveAppBar';
import type { MusicItem } from '@/types';
import type { ActionSheetItem } from '@/widgets/overlays/ActionSheetPanel';

/** source 菜单项 → ActionSheet 行 */
function toSheetItems(
    actions: readonly CollectionMenuAction[],
): ActionSheetItem[] {
    return actions.map(a => ({
        icon: a.icon,
        label: a.label,
        danger: a.danger,
        disabled: a.disabled,
        onPress: a.onPress,
    }));
}

/**
 * 歌单 / 集合详情页（业务 widget）：消费注入的 source，自持跨源动作（import core）
 */
export function MusicCollectionDetail({ source }: MusicCollectionDetailProps) {
    const currentKey = useCurrentMusicKey();
    const t = useT();
    const {
        header,
        musicList,
        listState,
        retryInitialLoad,
        errorMessage,
        pagination,
        star,
        sort,
        overflowActions,
        itemOptionsSource,
        editDisabledReason,
    } = source;

    const hasMusic = listState === 'ready' && musicList.length > 0;
    const canEdit = !editDisabledReason;

    const back = useBackAction();
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const layoutClass = useLayoutClass();
    // 平板竖屏：头部 banner 内容线 16 → 32（手机 undefined、styles.banner 原样）
    const gutter = useContentGutter();
    // 横屏用普通 AppBar，StatusBar 得自己渲染（页面 Screen 关了 statusBar，原本由 ImmersiveAppBar 承担）
    const chromeIsDark = useAtomValue(chromeIsDarkAtom);
    // 列表底部让出安全区：无播放条时最后一行不被系统手势区遮挡；有播放条时其在流内自承接
    const listContentStyle = useMemo(
        () => ({ paddingBottom: insets.bottom }),
        [insets.bottom],
    );
    const scrollY = useSharedValue(0);
    const onScroll = useAnimatedScrollHandler(event => {
        scrollY.value = event.contentOffset.y;
    });

    const playFrom = useCallback(
        (item: MusicItem) => {
            player.replaceQueueAndPlay(item, [...musicList]).catch(() => {});
        },
        [musicList],
    );
    const addAll = useCallback(() => {
        if (musicList.length > 0) {
            // 新建歌单时预填当前集合标题：整表加入时可直接沿用其名
            showAddToPlaylistPanel({
                items: musicList,
                suggestedPlaylistName: header.title,
            });
        }
    }, [musicList, header.title]);
    const openSearch = useCallback(() => {
        if (musicList.length === 0) {
            return;
        }
        // 列表快照含插件私有字段、不可靠序列化 → 存 stash 只传 ticket；播放/来源上下文由搜索页据此重建
        const ticket = stash({
            musicList: [...musicList],
            itemOptionsSource,
            title: header.title,
        });
        navigation.navigate('SearchInList', { ticket });
    }, [musicList, itemOptionsSource, header.title, navigation]);
    // 多选批量页：本地歌单可拖拽 / 移除，其余源只读（曲目快照经 stash 交付，插件私有字段不进导航参数）
    const openMultiSelect = useCallback(() => {
        if (musicList.length === 0) {
            return;
        }
        navigation.navigate(
            'MusicSelection',
            itemOptionsSource.kind === 'localPlaylist'
                ? {
                      kind: 'localPlaylist',
                      playlistId: itemOptionsSource.playlistId,
                  }
                : { kind: 'generic', ticket: stash([...musicList]) },
        );
    }, [musicList, itemOptionsSource, navigation]);

    const openDescription = useCallback(() => {
        if (header.description) {
            showMediaDescriptionPanel({
                title: header.title,
                description: header.description,
            });
        }
    }, [header]);
    const openItemMenu = useCallback(
        (item: MusicItem) => {
            showMusicItemOptionsPanel({ item, source: itemOptionsSource });
        },
        [itemOptionsSource],
    );
    const pickSort = useCallback(() => {
        if (!sort) {
            return;
        }
        showActionSheetPanel({
            title: t('media.sort'),
            items: sort.options.map(o => ({
                label: o.label,
                selected: o.key === sort.activeKey,
                onPress: () => sort.onSelect(o.key),
            })),
        });
    }, [sort, t]);

    // ⋮ 的契约是「本页能做的事的完整清单」：widget 自持的跨源项在前，source 的源特定项在后
    // 「批量管理」与操作条上的图标是同一入口，此处的重复是清单完整性所必需
    // 两个动作数组每次渲染现构：t 是稳定的模块函数，放进 useMemo 会在切换语言后留住旧译文
    const menuActions: CollectionMenuAction[] = [
        ...(hasMusic
            ? [
                  {
                      icon: 'list-checks' as const,
                      label: t('musicCollectionDetail.batchManage'),
                      onPress: openMultiSelect,
                  },
                  {
                      icon: 'folder-plus' as const,
                      label: t('musicCollectionDetail.addToPlaylist'),
                      onPress: addAll,
                  },
              ]
            : []),
        ...overflowActions,
    ];
    const openOverflowMenu = () => {
        if (menuActions.length > 0) {
            showActionSheetPanel({ items: toSheetItems(menuActions) });
        }
    };
    // 搜索常驻顶栏（唯一不随滚动消失的表面）；空列表无可搜内容 → 不渲染
    const appBarActions: ImmersiveAppBarAction[] = hasMusic
        ? [
              {
                  icon: 'search',
                  label: t('common.search'),
                  onPress: openSearch,
              },
          ]
        : [];

    const renderItem = useCallback(
        ({ item, index }: { item: MusicItem; index: number }) => (
            <MusicRow
                item={item}
                position={index + 1}
                onPress={playFrom}
                onMore={openItemMenu}
            />
        ),
        [playFrom, openItemMenu],
    );

    const listHeader = (
        <View>
            <CollectionHeader
                header={header}
                star={star}
                onPressDescription={openDescription}
            />
            {editDisabledReason ? (
                <Text
                    size="sm"
                    color="warning"
                    style={gutter ? [styles.banner, gutter] : styles.banner}
                >
                    {editDisabledReason}
                </Text>
            ) : null}
            {hasMusic ? (
                // header 不经行容器，平板要自己对齐到与行同一内容列
                <ContentColumn kind="list">
                    <PlayAllBar
                        musicList={musicList}
                        onSort={sort ? pickSort : undefined}
                        onMultiSelect={openMultiSelect}
                        sortDisabled={!canEdit}
                    />
                </ContentColumn>
            ) : null}
        </View>
    );

    const empty =
        listState === 'error'
            ? {
                  icon: 'triangle-alert' as const,
                  title: errorMessage ?? t('feedback.loadFailed'),
                  action: retryInitialLoad
                      ? { label: t('common.retry'), onPress: retryInitialLoad }
                      : undefined,
              }
            : {
                  icon: 'list-music' as const,
                  title: t('musicCollectionDetail.emptyTitle'),
              };

    // 平板横屏：头部固定为左栏（不随滚动收起），右栏列表满高滚动；顶栏改普通 AppBar（无折叠联动）
    if (layoutClass === 'tabletLandscape') {
        return (
            <View style={styles.container}>
                <StatusBar
                    translucent
                    backgroundColor="transparent"
                    barStyle={chromeIsDark ? 'light-content' : 'dark-content'}
                />
                <AppBar
                    leading={back}
                    actions={appBarActions}
                    overflow={
                        menuActions.length > 0
                            ? { onPress: openOverflowMenu }
                            : undefined
                    }
                />
                <View style={styles.panes}>
                    <CollectionSidePane
                        header={header}
                        star={star}
                        banner={editDisabledReason}
                        musicList={hasMusic ? musicList : []}
                        onSort={sort ? pickSort : undefined}
                        onMultiSelect={openMultiSelect}
                        sortDisabled={!canEdit}
                    />
                    <View style={styles.listPane}>
                        <MediaList
                            locateCurrent
                            locateKey={currentKey}
                            data={musicList}
                            renderItem={renderItem}
                            keyExtractor={mediaKey}
                            maintainVisibleContentPosition={false}
                            isLoading={listState === 'loading'}
                            hasNextPage={pagination?.hasMore ?? false}
                            isFetchingNextPage={
                                pagination?.isLoadingMore ?? false
                            }
                            isFetchNextPageError={
                                pagination?.hasLoadMoreError ?? false
                            }
                            onEndReached={pagination?.loadMore}
                            onRetryNextPage={pagination?.loadMore}
                            empty={empty}
                            contentContainerStyle={listContentStyle}
                        />
                    </View>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <MediaList
                locateCurrent
                locateKey={currentKey}
                data={musicList}
                renderItem={renderItem}
                keyExtractor={mediaKey}
                ListHeaderComponent={listHeader}
                onScroll={onScroll}
                maintainVisibleContentPosition={false}
                isLoading={listState === 'loading'}
                hasNextPage={pagination?.hasMore ?? false}
                isFetchingNextPage={pagination?.isLoadingMore ?? false}
                isFetchNextPageError={pagination?.hasLoadMoreError ?? false}
                onEndReached={pagination?.loadMore}
                onRetryNextPage={pagination?.loadMore}
                empty={empty}
                contentContainerStyle={listContentStyle}
            />
            <ImmersiveAppBar
                scrollY={scrollY}
                coverHeight={COVER_HEIGHT}
                title={header.title}
                onBack={back.onPress}
                actions={appBarActions}
                onOverflow={
                    menuActions.length > 0 ? openOverflowMenu : undefined
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    banner: {
        paddingHorizontal: space.lg,
        paddingTop: space.sm,
    },
    panes: {
        flex: 1,
        flexDirection: 'row',
    },
    listPane: {
        flex: 1,
        minWidth: 0,
    },
});
