import { useNavigation } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ContentUnavailable } from '@/components/ui/ContentUnavailable';
import { Loading } from '@/components/ui/Loading';
import { MediaCard } from '@/components/ui/MediaCard';
import { Text } from '@/components/ui/Text';
import { useCurrentMusic } from '@/core/player';
import { layout, space } from '@/design';
import { useGutterExtra } from '@/hooks/useContentColumn';
import { useT } from '@/i18n';
import { stash } from '@/infra/stash';
import { mediaKey } from '@/utils/media';
import { firstNonBlank } from '@/utils/text';
import { showRecommendTagPanel } from '@/widgets/overlays/RecommendTagPanel';

import { useRecommendPlaylists } from '../hooks/useRecommendPlaylists';
import { useRecommendTags } from '../hooks/useRecommendTags';
import { useSelectedRecommendTag } from '../hooks/useSelectedRecommendTag';

import { CategoryBar } from './CategoryBar';

import type { Plugin } from '@/core/plugin';
import type { PlaylistItemBase } from '@/types';

/** 无数据时的稳定空引用，避免每次渲染新数组触发下游重渲染 */
const EMPTY_ITEMS: readonly PlaylistItemBase[] = [];

/** 拍成两列的行数据（尾单个成一行） */
function toPairRows(items: readonly PlaylistItemBase[]): PlaylistItemBase[][] {
    const rows: PlaylistItemBase[][] = [];
    for (let i = 0; i < items.length; i += 2) {
        const left = items[i];
        if (!left) {
            continue;
        }
        const right = items[i + 1];
        rows.push(right ? [left, right] : [left]);
    }
    return rows;
}

/** 单个推荐歌单封面格：封面 artwork→coverImg→兜底图，标题 / 描述取非空串 */
function RecommendCell({
    item,
    onPress,
}: {
    item: PlaylistItemBase;
    onPress: (item: PlaylistItemBase) => void;
}) {
    const t = useT();
    return (
        <MediaCard
            fill
            source={firstNonBlank(item.artwork, item.coverImg)}
            fallbackIcon="list-music"
            title={firstNonBlank(item.title) ?? t('media.unknownTitle')}
            subtitle={firstNonBlank(item.description)}
            onPress={() => onPress(item)}
        />
    );
}

/**
 * 单个推荐源：分类带（pinned + 全部分类入口）+ 该分类的两列封面网格 + 分页
 * 标签与推荐列表两套查询独立：标签失败只在分类带原位重试，不波及已加载网格（§4.4）
 * 切分类 = FlashList 按 tagId 重建（回顶 + 新分类首屏）；切源保持挂载由 PluginSourcePager 承担
 */
export function RecommendSourceView({ plugin }: { plugin: Plugin }) {
    const t = useT();
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const current = useCurrentMusic();

    const tagsQuery = useRecommendTags(plugin);
    const tags = tagsQuery.data;
    const { pinnedTags, selectedTag, selectTag } = useSelectedRecommendTag(
        plugin.platform,
        tags,
    );

    const listQuery = useRecommendPlaylists(plugin, selectedTag);
    // 拼接各页、按 mediaKey 去重（保首现）——聚合插件常跨页返回同 id
    const items = useMemo<readonly PlaylistItemBase[]>(() => {
        const pages = listQuery.data?.pages;
        if (!pages) {
            return EMPTY_ITEMS;
        }
        const seen = new Set<string>();
        const out: PlaylistItemBase[] = [];
        for (const page of pages) {
            for (const item of page?.data ?? []) {
                const key = mediaKey(item);
                if (!seen.has(key)) {
                    seen.add(key);
                    out.push(item);
                }
            }
        }
        return out;
    }, [listQuery.data]);
    const pairRows = useMemo(() => toPairRows(items), [items]);

    const openPlaylist = useCallback(
        (item: PlaylistItemBase) => {
            // 完整 DTO 存 stash、只传 ticket（含插件私有字段、不可靠序列化）
            const ticket = stash(item);
            navigation.navigate('PluginPlaylistDetail', { ticket });
        },
        [navigation],
    );

    const openAllCategories = useCallback(() => {
        if (!selectedTag) {
            return;
        }
        showRecommendTagPanel({
            pinned: pinnedTags,
            groups: tags?.data ?? [],
            selectedTagId: selectedTag.id,
            onSelect: selectTag,
        });
    }, [pinnedTags, tags, selectedTag, selectTag]);

    const renderRow = useCallback(
        ({ item: pair }: { item: PlaylistItemBase[] }) => (
            <View style={styles.row}>
                <View style={styles.cell}>
                    {pair[0] ? (
                        <RecommendCell item={pair[0]} onPress={openPlaylist} />
                    ) : null}
                </View>
                <View style={styles.cell}>
                    {pair[1] ? (
                        <RecommendCell item={pair[1]} onPress={openPlaylist} />
                    ) : null}
                </View>
            </View>
        ),
        [openPlaylist],
    );

    // 平板：行自带 16 内距，再补 16 落到内容线 32（手机 gutterExtra 为 undefined、不变）
    const gutterExtra = useGutterExtra();
    const contentStyle = useMemo(
        () => ({
            paddingTop: space.md,
            paddingBottom: space.lg + (current ? 0 : insets.bottom),
            ...gutterExtra,
        }),
        [current, insets.bottom, gutterExtra],
    );

    // tags 是分类与列表的前提：首屏 loading / 失败 / 无可选分类都走全屏面板（不在分类带位置放小 loading / 重试）
    if (tagsQuery.isLoading) {
        return <Loading variant="fullscreen" />;
    }
    if (tagsQuery.isLoadingError) {
        return (
            <ContentUnavailable
                icon="triangle-alert"
                title={t('recommendPlaylists.tagLoadError')}
                action={{
                    label: t('common.retry'),
                    onPress: () => {
                        tagsQuery.refetch();
                    },
                }}
                style={styles.fill}
            />
        );
    }
    if (!selectedTag) {
        return (
            <ContentUnavailable
                icon="list-music"
                title={t('recommendPlaylists.noTags')}
                style={styles.fill}
            />
        );
    }

    // tags 就绪、有选中分类 → 分类带常驻 + 列表区（列表 loading / 失败 / 空只填列表区）
    let listContent;
    if (listQuery.isLoading) {
        listContent = <Loading variant="fullscreen" />;
    } else if (listQuery.isLoadingError) {
        listContent = (
            <ContentUnavailable
                icon="triangle-alert"
                title={t('recommendPlaylists.loadError')}
                action={{
                    label: t('common.retry'),
                    onPress: () => {
                        listQuery.refetch();
                    },
                }}
                style={styles.fill}
            />
        );
    } else if (items.length === 0) {
        listContent = (
            <ContentUnavailable
                icon="list-music"
                title={t('recommendPlaylists.empty')}
                style={styles.fill}
            />
        );
    } else {
        listContent = (
            <FlashList
                // 切分类重建：回顶 + 展示新分类首屏，不把旧分类结果留在新分类名下
                key={selectedTag.id}
                data={pairRows}
                keyExtractor={pair =>
                    pair[1]
                        ? `${mediaKey(pair[0]!)}|${mediaKey(pair[1])}`
                        : mediaKey(pair[0]!)
                }
                renderItem={renderRow}
                onEndReached={() => {
                    // 门控：有下一页、不在途、无分页错误才自动翻页；cancelRefetch:false 不打断在途请求
                    if (
                        listQuery.hasNextPage &&
                        !listQuery.isFetchingNextPage &&
                        !listQuery.isFetchNextPageError
                    ) {
                        listQuery.fetchNextPage({ cancelRefetch: false });
                    }
                }}
                onEndReachedThreshold={0.5}
                ListFooterComponent={
                    listQuery.isFetchingNextPage ? (
                        <View style={styles.footer}>
                            <Loading />
                        </View>
                    ) : listQuery.isFetchNextPageError ? (
                        <Pressable
                            style={styles.footer}
                            onPress={() => {
                                listQuery.fetchNextPage({
                                    cancelRefetch: false,
                                });
                            }}
                            accessibilityRole="button"
                        >
                            <Text size="sm" color="textSecondary">
                                {t('common.retry')}
                            </Text>
                        </Pressable>
                    ) : null
                }
                contentContainerStyle={contentStyle}
                showsVerticalScrollIndicator={false}
            />
        );
    }

    return (
        <View style={styles.root}>
            <CategoryBar
                pinned={pinnedTags}
                selectedTag={selectedTag}
                onSelect={selectTag}
                onOpenAll={openAllCategories}
            />
            <View style={styles.listArea}>{listContent}</View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    listArea: { flex: 1 },
    fill: { flex: 1 },
    row: {
        flexDirection: 'row',
        gap: space.md,
        paddingHorizontal: space.lg,
        paddingBottom: space.md,
    },
    cell: { flex: 1 },
    footer: {
        minHeight: layout.hitTarget,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: space.md,
    },
});
