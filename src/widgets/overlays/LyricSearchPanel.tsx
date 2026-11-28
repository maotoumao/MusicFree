/**
 * 搜索歌词面板：从歌词页为目标歌搜索一份更合适的歌词并关联
 * 打开即用「歌名 歌手」自动搜一次（免空白态）；多源经顶部 chip 行切换；结果行以元数据为主、rawLrcTxt 机会式预览
 * 普通 app 令牌（非沉浸 cover），随兄弟歌词面板先例；点结果行取权威词关联到目标歌
 */
import { useInfiniteQuery } from '@tanstack/react-query';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Keyboard, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { definePanel, showToast } from '@/components/overlay';
import { Box } from '@/components/ui/Box';
import { Button } from '@/components/ui/Button';
import { ChipRow } from '@/components/ui/ChipRow';
import { ContentUnavailable } from '@/components/ui/ContentUnavailable';
import { IconButton, iconButtonEdgeInset } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { ListItem } from '@/components/ui/ListItem';
import { MediaList } from '@/components/ui/MediaList';
import { Spinner } from '@/components/ui/Spinner';
import { Tag } from '@/components/ui/Tag';
import { Text } from '@/components/ui/Text';
import { lyric } from '@/core/lyric';
import { pluginQueryKey, useSearchablePlugins } from '@/core/plugin';
import { layout, space } from '@/design';
import { useOrientation } from '@/hooks/useOrientation';
import { useT } from '@/i18n';
import { isSameMediaRef, mediaKey } from '@/utils/media';
import { formatDuration } from '@/utils/time';

import type { OverlayProps } from '@/components/overlay';
import type { Plugin } from '@/core/plugin';
import type { LyricItem, MusicItem, SearchResult } from '@/types';

/** 竖屏内容区高占比：给输入 / 来源 / 结果一个有界高度，仍露出背景歌词页 */
const PORTRAIT_CONTENT_RATIO = 0.72;

/** 单源歌词搜索（TanStack 无限分页）；无源 / 空词禁用请求 */
function useLyricSearch(plugin: Plugin | undefined, query: string) {
    const queryKey = useMemo(
        () =>
            pluginQueryKey(
                plugin?.platform,
                'search',
                plugin?.hash,
                'lyric',
                query,
            ),
        [plugin?.platform, plugin?.hash, query],
    );
    const canSearch = query !== '' && plugin != null;
    const {
        data,
        isLoading,
        isError,
        hasNextPage,
        isFetchingNextPage,
        isFetchNextPageError,
        fetchNextPage,
        refetch,
    } = useInfiniteQuery({
        queryKey,
        enabled: canSearch,
        initialPageParam: 1,
        queryFn: ({ pageParam }): Promise<SearchResult<'lyric'>> =>
            plugin
                ? plugin.methods.search(query, pageParam, 'lyric')
                : Promise.resolve({ data: [] }),
        getNextPageParam: (last, all) =>
            last.isEnd ? undefined : all.length + 1,
    });
    // 聚合类插件常在页内 / 跨页返回同 id；按 platform+id 去重，避免 FlashList keyExtractor 撞键
    const items = useMemo<LyricItem[]>(() => {
        const pages = data?.pages;
        if (!pages) {
            return [];
        }
        const seen = new Set<string>();
        const out: LyricItem[] = [];
        for (const page of pages) {
            for (const item of page.data) {
                const key = mediaKey(item);
                if (seen.has(key)) {
                    continue;
                }
                seen.add(key);
                out.push(item);
            }
        }
        return out;
    }, [data]);
    return {
        items,
        isLoading,
        isError,
        hasNextPage,
        isFetchingNextPage,
        isFetchNextPageError,
        fetchNextPage,
        refetch,
    };
}

interface LyricResultRowProps {
    item: LyricItem;
    onSelect: (item: LyricItem) => void;
    /** 本行正在关联：尾部显示 spinner（关联进行中的忙态反馈） */
    loading?: boolean;
}

/**
 * 结果行：标题 + 来源 Tag 为主辨识层；次行歌手 · 专辑 · 时长（有值才拼）
 * rawLrcTxt 仅作机会式预览（多数插件不回填，缺省即静默省略、不放占位）
 */
const LyricResultRow = memo(function LyricResultRowView({
    item,
    onSelect,
    loading,
}: LyricResultRowProps) {
    const t = useT();
    const metaParts = [
        item.artist,
        item.album || null,
        item.duration > 0 ? formatDuration(item.duration) : null,
    ].filter(Boolean) as string[];
    // 归一换行 + 去空白空行，取内容行作预览（多数插件不回填 rawLrcTxt，缺省即无预览行）
    const previewLines =
        item.rawLrcTxt
            ?.replace(/\r\n?/g, '\n')
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean) ?? [];
    const preview = previewLines.join('\n');
    // 读屏名组合所有可辨识字段（缺失字段不产生空标点）+ 首行预览
    const a11yLabel = t('lyricSearchPanel.a11y.result', {
        fields: [item.title, ...metaParts, item.platform, previewLines[0]]
            .filter(Boolean)
            .join('，'),
    });
    return (
        <ListItem
            title={
                <Box row align="center" gap="sm">
                    <Text
                        weight="medium"
                        numberOfLines={1}
                        style={styles.title}
                    >
                        {item.title}
                    </Text>
                    <Tag label={item.platform} />
                </Box>
            }
            subtitle={
                <>
                    {metaParts.length > 0 ? (
                        <Text size="sm" color="textSecondary" numberOfLines={1}>
                            {metaParts.join(' · ')}
                        </Text>
                    ) : null}
                    {preview ? (
                        <Text
                            size="sm"
                            color="textSecondary"
                            numberOfLines={2}
                            style={styles.preview}
                        >
                            {preview}
                        </Text>
                    ) : null}
                </>
            }
            trailing={
                loading ? (
                    <Spinner size="sm" color="textSecondary" />
                ) : undefined
            }
            onPress={() => onSelect(item)}
            accessibilityLabel={a11yLabel}
        />
    );
});

export interface LyricSearchInput {
    /** 关联目标歌（歌词页传当前歌） */
    item: MusicItem;
}

function LyricSearchPanelView({
    payload,
    close,
}: OverlayProps<LyricSearchInput, void>) {
    const { item: target } = payload;
    const t = useT();
    const orientation = useOrientation();
    const { height: windowHeight } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const landscape = orientation === 'landscape';

    // 只留能真正取词关联的源：既支持 lyric 搜索、又支持 getLyric（协议上两能力独立，避免「搜得到点不了」）
    const searchable = useSearchablePlugins('lyric');
    const sources = useMemo(
        () => searchable.filter(p => p.supportedMethods.has('getLyric')),
        [searchable],
    );
    const defaultQuery = target.title;

    const [draftQuery, setDraftQuery] = useState(defaultQuery);
    // 打开即搜：默认词非空即首帧提交（免空白态）；空则留 idle
    const [submittedQuery, setSubmittedQuery] = useState(defaultQuery);
    // 初始选中当前歌所属插件（若支持歌词搜索），否则首个可用源
    const [activePlatform, setActivePlatform] = useState<string | undefined>(
        () =>
            sources.find(p => p.platform === target.platform)?.platform ??
            sources[0]?.platform,
    );
    // 有效源：渲染期同步派生——当前选中若失效（启停 / 增删 / 更新）立即回落到当前歌插件或首个，
    // 避免仅靠 effect 回落时、补正前那一帧误显空态
    const activeSource = useMemo(
        () =>
            sources.find(p => p.platform === activePlatform) ??
            sources.find(p => p.platform === target.platform) ??
            sources[0],
        [sources, activePlatform, target.platform],
    );
    // 把派生的有效源同步回选中态（供 ChipRow 高亮）
    useEffect(() => {
        if (activeSource && activeSource.platform !== activePlatform) {
            setActivePlatform(activeSource.platform);
        }
    }, [activeSource, activePlatform]);
    // 多源选择器数据：platform 既作 key 又作显示名
    const sourceItems = useMemo(
        () => sources.map(p => ({ key: p.platform, label: p.platform })),
        [sources],
    );
    const {
        items,
        isLoading,
        isError,
        hasNextPage,
        isFetchingNextPage,
        isFetchNextPageError,
        fetchNextPage,
        refetch,
    } = useLyricSearch(activeSource, submittedQuery);

    // 正在关联的结果行 mediaKey（非空 = 关联进行中）：所点行显示 spinner、结果区与换源锁定、输入不发起二次搜索
    const [associatingKey, setAssociatingKey] = useState<string | null>(null);
    const busy = associatingKey !== null;

    const submit = useCallback(() => {
        // 关联进行中不发起二次搜索（避免结果列表在关联落库时被换掉）
        if (busy) {
            return;
        }
        const q = draftQuery.trim();
        if (q === '') {
            return;
        }
        setSubmittedQuery(q);
        Keyboard.dismiss();
    }, [draftQuery, busy]);

    // 仅当已提交词非空、且输入未被改动（draft 与已提交一致）才显示结果；
    // 编辑 / 清空中回到 idle，避免旧词结果被当作新词的结果误点关联；
    // 但关联进行中强制保留结果区（此时必有结果列表）——否则编辑输入会把正在关联的行与 spinner 一并切走
    const showResults =
        busy || (submittedQuery !== '' && draftQuery.trim() === submittedQuery);

    const loadMore = useCallback(() => {
        fetchNextPage({ cancelRefetch: false }).catch(() => {});
    }, [fetchNextPage]);

    const retry = useCallback(() => {
        refetch().catch(() => {});
    }, [refetch]);

    // 点结果行 → 关联到 target：先拦自引用（点到当前歌自身），否则取权威词落库；成功关面板、失败留面板重试
    const onSelect = useCallback(
        async (item: LyricItem) => {
            if (busy) {
                return;
            }
            if (isSameMediaRef(target, item)) {
                showToast(t('lyricSearchPanel.associateSelf'));
                return;
            }
            setAssociatingKey(mediaKey(item));
            try {
                const ok = await lyric.associateLyric(target, item);
                if (ok) {
                    showToast(t('lyricSearchPanel.associateSuccess'), {
                        type: 'success',
                    });
                    close();
                    return;
                }
                showToast(t('lyricSearchPanel.associateFailed'), {
                    type: 'error',
                });
            } catch {
                showToast(t('lyricSearchPanel.associateFailed'), {
                    type: 'error',
                });
            }
            setAssociatingKey(null);
        },
        [busy, target, t, close],
    );

    const renderRow = useCallback(
        ({ item }: { item: LyricItem }) => (
            <LyricResultRow
                item={item}
                onSelect={onSelect}
                loading={mediaKey(item) === associatingKey}
            />
        ),
        [onSelect, associatingKey],
    );

    // 关联进行中锁定换源（避免关联目标与当前展示来源错位）
    const handleSelectSource = useCallback(
        (platform: string) => {
            if (busy) {
                return;
            }
            setActivePlatform(platform);
        },
        [busy],
    );

    // 竖屏内容高度：期望占比，收敛到壳可用高之内，避免溢出被裁；横屏交给 flex
    const portraitHeight = Math.min(
        windowHeight * PORTRAIT_CONTENT_RATIO,
        Math.min(windowHeight * 0.9, windowHeight - insets.top) -
            space.lg -
            insets.bottom -
            space.xl,
    );

    const header = (
        <View style={styles.header}>
            <View style={styles.headerText}>
                <Text size="xl" weight="bold" numberOfLines={1}>
                    {t('lyricSearchPanel.title')}
                </Text>
                <Text
                    size="sm"
                    color="textSecondary"
                    numberOfLines={1}
                    style={styles.subtitle}
                >
                    {t('lyricSearchPanel.targetHint', { title: target.title })}
                </Text>
            </View>
            <IconButton
                icon="x"
                onPress={() => close()}
                accessibilityLabel={t('common.close')}
            />
        </View>
    );

    // 无任何 lyric-capable 插件：只提示（「管理插件」快捷入口待导航 ref，暂由文案引导）
    if (sources.length === 0) {
        return (
            <View
                style={landscape ? styles.rootFill : { height: portraitHeight }}
            >
                {header}
                <View style={styles.content}>
                    <ContentUnavailable
                        icon="triangle-alert"
                        title={t('lyricSearchPanel.noSource')}
                        description={t('lyricSearchPanel.noSourceHint')}
                    />
                </View>
            </View>
        );
    }

    return (
        <View style={landscape ? styles.rootFill : { height: portraitHeight }}>
            {header}
            <View style={styles.searchRow}>
                <Input
                    value={draftQuery}
                    onChangeText={setDraftQuery}
                    size="md"
                    leadingIcon="search"
                    clearable
                    returnKeyType="search"
                    onSubmitEditing={submit}
                    placeholder={t('lyricSearchPanel.placeholder')}
                    accessibilityLabel={t('lyricSearchPanel.a11y.input')}
                    style={styles.input}
                />
                <Button
                    size="md"
                    onPress={submit}
                    disabled={draftQuery.trim() === '' || busy}
                >
                    {t('common.search')}
                </Button>
            </View>
            {sources.length > 1 ? (
                <ChipRow
                    items={sourceItems}
                    activeKey={activeSource?.platform ?? ''}
                    onSelect={handleSelectSource}
                />
            ) : null}
            <View style={styles.content} pointerEvents={busy ? 'none' : 'auto'}>
                {showResults ? (
                    <MediaList
                        // 切源即重挂：列表滚动位归顶，不沿用上一来源的偏移
                        key={activeSource?.platform}
                        data={items}
                        renderItem={renderRow}
                        keyExtractor={mediaKey}
                        isLoading={isLoading}
                        hasNextPage={hasNextPage}
                        isFetchingNextPage={isFetchingNextPage}
                        isFetchNextPageError={isFetchNextPageError}
                        onEndReached={loadMore}
                        onRetryNextPage={loadMore}
                        empty={
                            isError
                                ? {
                                      icon: 'circle-x',
                                      title: t('lyricSearchPanel.sourceError'),
                                      description: t(
                                          'lyricSearchPanel.sourceErrorHint',
                                      ),
                                      action: {
                                          label: t('common.retry'),
                                          onPress: retry,
                                      },
                                  }
                                : {
                                      icon: 'search',
                                      title: t('lyricSearchPanel.noResults'),
                                      description: t(
                                          'lyricSearchPanel.noResultsHint',
                                      ),
                                  }
                        }
                    />
                ) : (
                    <ContentUnavailable
                        icon="search"
                        title={t('lyricSearchPanel.idle')}
                    />
                )}
            </View>
        </View>
    );
}

/** 打开搜索歌词面板（从歌词页工具行 / 无歌词空态拉起，payload.item = 目标歌） */
export const showLyricSearchPanel = definePanel<LyricSearchInput, void>(
    LyricSearchPanelView,
    // 顶部搜索框 + 下方结果列表：键盘 overlap 不避让（面板不被顶起），键盘覆盖列表下部、被盖结果收键盘后可见
    { keyboardBehavior: 'overlap' },
);

const styles = StyleSheet.create({
    // 横屏右侧全高 sheet：整体撑满，让内容区 flex 生效
    rootFill: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space.sm,
        paddingLeft: layout.screenGutter,
        /** 右端是贴边关闭按钮，外推后图标本体落回内容线 */
        paddingRight: iconButtonEdgeInset(layout.screenGutter),
        paddingBottom: space.md,
    },
    headerText: {
        flex: 1,
    },
    subtitle: {
        marginTop: space.xs,
    },
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        paddingHorizontal: space.lg,
        paddingBottom: space.md,
    },
    input: {
        flex: 1,
    },
    content: {
        flex: 1,
        minHeight: 0,
    },
    // 标题占主、可省略；来源 Tag 不压缩
    title: {
        flexShrink: 1,
    },
    preview: {
        marginTop: space.xs,
    },
});
