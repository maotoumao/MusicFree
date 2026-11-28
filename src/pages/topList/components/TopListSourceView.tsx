import { useNavigation } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ContentUnavailable } from '@/components/ui/ContentUnavailable';
import { Loading } from '@/components/ui/Loading';
import { MediaCard } from '@/components/ui/MediaCard';
import { Text } from '@/components/ui/Text';
import { useCurrentMusic } from '@/core/player';
import { space } from '@/design';
import { useGutterExtra } from '@/hooks/useContentColumn';
import { useT } from '@/i18n';
import { stash } from '@/infra/stash';
import { mediaKey } from '@/utils/media';
import { firstNonBlank } from '@/utils/text';

import { useTopLists } from '../hooks/useTopLists';

import type { Plugin } from '@/core/plugin';
import type { PlaylistGroup, PlaylistItemBase } from '@/types';

/** 展平后的一行：分组标题 或 一行两个榜单 */
type TopListRow =
    | { type: 'header'; key: string; title: string; first: boolean }
    | {
          type: 'pair';
          key: string;
          left: PlaylistItemBase;
          right?: PlaylistItemBase;
      };

/**
 * PlaylistGroup[] → 单一纵向列表的行（分组标题 + 两列成对）
 * 跳过空组、缺 title 的组只出网格；key 取媒体身份（刷新 / 重排后稳定复用，不用数组下标）
 */
function flattenGroups(groups: PlaylistGroup[] | undefined): TopListRow[] {
    if (!groups) {
        return [];
    }
    const rows: TopListRow[] = [];
    let hasHeader = false;
    groups.forEach(group => {
        const items = group.data ?? [];
        const firstItem = items[0];
        if (!firstItem) {
            return;
        }
        const title = firstNonBlank(group.title);
        if (title) {
            rows.push({
                type: 'header',
                key: `h:${mediaKey(firstItem)}`,
                title,
                first: !hasHeader,
            });
            hasHeader = true;
        }
        for (let i = 0; i < items.length; i += 2) {
            const left = items[i];
            if (!left) {
                continue;
            }
            const right = items[i + 1];
            rows.push({
                type: 'pair',
                key: right
                    ? `${mediaKey(left)}|${mediaKey(right)}`
                    : mediaKey(left),
                left,
                right,
            });
        }
    });
    return rows;
}

/** 单个榜单封面格：封面 artwork→coverImg→兜底图，标题 / 描述取非空串 */
function TopListCell({
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
 * 单个插件源的榜单内容：分组标题 + 两列封面网格（单一纵向 FlashList）
 * 首屏加载 Loading、首次失败 / 空态 ContentUnavailable（有缓存的后台刷新失败保留列表）；点榜单进详情
 */
export function TopListSourceView({ plugin }: { plugin: Plugin }) {
    const t = useT();
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const current = useCurrentMusic();
    const { data, isLoading, isLoadingError, refetch } = useTopLists(plugin);
    const rows = useMemo(() => flattenGroups(data), [data]);

    // MusicBar 在场时它承接底部安全区；缺席时列表自让出，避免最后一排被系统手势区遮挡
    // 平板：行与分组标题自带 16 内距，再补 16 落到内容线 32（手机 gutterExtra 为 undefined、不变）
    const gutterExtra = useGutterExtra();
    const contentStyle = useMemo(
        () => ({
            paddingBottom: space.lg + (current ? 0 : insets.bottom),
            ...gutterExtra,
        }),
        [current, insets.bottom, gutterExtra],
    );

    const openTopList = useCallback(
        (item: PlaylistItemBase) => {
            // 榜单 DTO 存 stash、只传 ticket（含插件私有字段、不可靠序列化）
            const ticket = stash(item);
            navigation.navigate('TopListDetail', { ticket });
        },
        [navigation],
    );

    const renderItem = useCallback(
        ({ item }: { item: TopListRow }) => {
            if (item.type === 'header') {
                return (
                    <Text
                        size="lg"
                        weight="bold"
                        style={[
                            styles.groupTitle,
                            item.first
                                ? styles.groupTitleFirst
                                : styles.groupTitleRest,
                        ]}
                    >
                        {item.title}
                    </Text>
                );
            }
            const { left, right } = item;
            return (
                <View style={styles.row}>
                    <View style={styles.cell}>
                        <TopListCell item={left} onPress={openTopList} />
                    </View>
                    <View style={styles.cell}>
                        {right ? (
                            <TopListCell item={right} onPress={openTopList} />
                        ) : null}
                    </View>
                </View>
            );
        },
        [openTopList],
    );

    if (isLoading) {
        return <Loading variant="fullscreen" />;
    }
    // 仅首次无数据失败才全屏错误；有缓存的后台刷新失败保留已加载列表
    if (isLoadingError) {
        return (
            <ContentUnavailable
                icon="triangle-alert"
                title={t('topList.loadError')}
                action={{
                    label: t('common.retry'),
                    onPress: () => {
                        refetch();
                    },
                }}
                style={styles.fill}
            />
        );
    }
    if (rows.length === 0) {
        return (
            <ContentUnavailable
                icon="list-music"
                title={t('topList.empty')}
                style={styles.fill}
            />
        );
    }
    return (
        <FlashList
            data={rows}
            keyExtractor={row => row.key}
            renderItem={renderItem}
            getItemType={row => row.type}
            contentContainerStyle={contentStyle}
            showsVerticalScrollIndicator={false}
        />
    );
}

const styles = StyleSheet.create({
    fill: { flex: 1 },
    // 分组标题：首组顶距 lg、后续组顶距 2xl（更大留白分隔组）；标题与首行封面间 md
    groupTitle: {
        paddingHorizontal: space.lg,
        paddingBottom: space.md,
    },
    groupTitleFirst: {
        paddingTop: space.lg,
    },
    groupTitleRest: {
        paddingTop: space['2xl'],
    },
    row: {
        flexDirection: 'row',
        gap: space.md,
        paddingHorizontal: space.lg,
        paddingBottom: space.md,
    },
    cell: {
        flex: 1,
    },
});
