/**
 * 播放队列浮层（面板可见标题「播放列表」，代码走 queue）：管理 / 概览当前播放队列
 * 头部固定工具栏（数量 + 循环模式 + 清空）+ 单行紧凑队列行（标题·歌手贴左，平台 Tag 与删除成组行尾）
 * 当前曲：primarySoft 整行底色 + 标题行首 inline 律动条（占最左位置、标题紧随）+ onPrimarySoft 标题；其余行标题从同一左缘起
 * 竖屏底部 sheet：内容区取窗口高比例的固定高度让 FlashList 有界虚拟滚动；横屏右侧全高：内容区 flex 撑满
 * 队列可被逐行删空（删除不关面板），故空态可达：内容区改显 ContentUnavailable
 */
import { FlashList } from '@shopify/flash-list';
import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { definePanel, useOverlayStatus } from '@/components/overlay';
import { Box } from '@/components/ui/Box';
import { Button } from '@/components/ui/Button';
import { ContentUnavailable } from '@/components/ui/ContentUnavailable';
import { IconButton } from '@/components/ui/IconButton';
import { ListItem } from '@/components/ui/ListItem';
import { Loading } from '@/components/ui/Loading';
import { PlayingIndicator } from '@/components/ui/PlayingIndicator';
import { Tag } from '@/components/ui/Tag';
import { Text } from '@/components/ui/Text';
import {
    PlaybackState,
    RepeatMode,
    player,
    useCurrentMusic,
    usePlaybackState,
    useQueue,
    useRepeatMode,
} from '@/core/player';
import { borderWidth, layout, space, useColors } from '@/design';
import { useOrientation } from '@/hooks/useOrientation';
import { useT } from '@/i18n';
import { isSameMediaRef, mediaKey } from '@/utils/media';

import type { OverlayProps } from '@/components/overlay';
import type { IconName } from '@/components/ui/icons.generated';
import type { MusicItem } from '@/types';

/** 循环模式 → 头部按钮图标（与 musicDetail/PlayControls 各持一份，映射微小、用法不同，不强抽共享） */
const REPEAT_ICON: Record<RepeatMode, IconName> = {
    [RepeatMode.Queue]: 'repeat',
    [RepeatMode.Single]: 'repeat-1',
    [RepeatMode.Shuffle]: 'shuffle',
};
/** 循环模式 → media.repeatMode.* 文案键 */
const REPEAT_LABEL: Record<RepeatMode, 'queue' | 'loop' | 'shuffle'> = {
    [RepeatMode.Queue]: 'queue',
    [RepeatMode.Single]: 'loop',
    [RepeatMode.Shuffle]: 'shuffle',
};

/** 竖屏内容区高度占窗口高的比例：给虚拟列表有界高度，同时留出上方内容与背景可见 */
const PORTRAIT_CONTENT_RATIO = 0.62;

interface QueueRowProps {
    item: MusicItem;
    isCurrent: boolean;
    /** 当前曲且引擎正在播放：律动条跳动（暂停时静止）；非当前曲恒 false */
    playing: boolean;
    onPlay: (item: MusicItem) => void;
    onRemove: (item: MusicItem) => void;
}

/**
 * 单行队列行：当前曲标题行首 inline 律动条（占最左位置）/ 其余行无前导 + 标题·歌手可点主区 + Tag·删除成组行尾
 * 文案在行内经 useT 自算，locale 切换随订阅重渲染（memo 比身份 + 显示字段 + 播放态 + 回调）
 */
const QueueRow = memo(
    function QueueRowBase({
        item,
        isCurrent,
        playing,
        onPlay,
        onRemove,
    }: QueueRowProps) {
        const t = useT();
        // 行读屏名含标题·歌手·平台（Tag / 律动条自身 a11y 隐藏，由行名统一念）
        // 当前曲身份由 ListItem 的 selected 语义播报，不在行名里重复前置
        const a11yLabel = [item.title, item.artist, item.platform]
            .filter(Boolean)
            .join('，');
        return (
            <ListItem
                dense
                selected={isCurrent}
                title={
                    <Box row align="center">
                        {isCurrent ? (
                            <View style={styles.indicatorInline}>
                                <PlayingIndicator animating={playing} />
                            </View>
                        ) : null}
                        <Text
                            size="md"
                            color={isCurrent ? 'onPrimarySoft' : 'text'}
                            numberOfLines={1}
                            style={styles.title}
                        >
                            {item.title}
                        </Text>
                        {item.artist ? (
                            <Text
                                size="xs"
                                color="textSecondary"
                                numberOfLines={1}
                                style={styles.artist}
                            >
                                {` - ${item.artist}`}
                            </Text>
                        ) : null}
                    </Box>
                }
                trailing={
                    <Box row align="center" gap="xs">
                        <Tag label={item.platform} />
                        <IconButton
                            icon="x"
                            size="sm"
                            edgeAlign="end"
                            accessibilityLabel={t(
                                'playQueuePanel.a11y.remove',
                                {
                                    title: item.title,
                                },
                            )}
                            onPress={() => onRemove(item)}
                        />
                    </Box>
                }
                accessibilityLabel={a11yLabel}
                onPress={() => onPlay(item)}
            />
        );
    },
    (prev, next) =>
        isSameMediaRef(prev.item, next.item) &&
        prev.item.title === next.item.title &&
        prev.item.artist === next.item.artist &&
        prev.item.platform === next.item.platform &&
        prev.isCurrent === next.isCurrent &&
        prev.playing === next.playing &&
        prev.onPlay === next.onPlay &&
        prev.onRemove === next.onRemove,
);

function PlayQueuePanelView({ close }: OverlayProps<void, void>) {
    const t = useT();
    const colors = useColors();
    // 进场动画放完才为真：期间只显 loading，把重队列列表推迟到开场后再渲染
    const { entered } = useOverlayStatus();
    const orientation = useOrientation();
    const { height: windowHeight } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const queue = useQueue();
    const current = useCurrentMusic();
    const repeatMode = useRepeatMode();
    const playbackState = usePlaybackState();
    const landscape = orientation === 'landscape';
    // 仅「引擎实际在播」才让律动条跳动；缓冲 / 暂停 / 停止都静止
    const isPlaying = playbackState === PlaybackState.Playing;
    // 竖屏内容整体高度：期望占比，但收敛到壳 maxHeight 之内（减顶部内距 + 底部安全区），
    // 避免固定高在小窗 / 大 inset 下溢出被 maxHeight 裁切、末行遮挡；横屏交给 flex 撑满
    const portraitHeight = Math.min(
        windowHeight * PORTRAIT_CONTENT_RATIO,
        Math.min(windowHeight * 0.9, windowHeight - insets.top) -
            space.lg -
            insets.bottom -
            space.xl,
    );

    // 打开滚到当前曲：推迟到进场结束、列表真正挂载那刻再取下标（进场期间切歌不致旧下标失准）
    // 仅取此一帧、后续切歌不重滚，避免打断浏览
    const initialScrollIndex = useMemo(() => {
        if (!entered) {
            return undefined;
        }
        const index = player.getCurrentIndex();
        return index >= 0 ? index : undefined;
    }, [entered]);

    // 稳定回调：配合 QueueRow memo，避免每次渲染新建闭包令所有行失效
    const playItem = useCallback((item: MusicItem) => {
        // 播放失败经 player.onError 统一处理，行层 fire-and-forget；不关面板让高亮随当前曲切换
        player.play(item).catch(() => {});
    }, []);
    const removeItem = useCallback((item: MusicItem) => {
        player
            .removeFromQueue({ platform: item.platform, id: item.id })
            .catch(() => {});
    }, []);
    const clear = useCallback(() => {
        player.clearQueue().catch(() => {});
        close();
    }, [close]);

    // 稳定 renderItem：仅当前曲身份或播放态变化时换引用，减少 FlashList 逐 cell 重算
    const renderItem = useCallback(
        ({ item }: { item: MusicItem }) => {
            const rowCurrent = current != null && isSameMediaRef(item, current);
            return (
                <QueueRow
                    item={item}
                    isCurrent={rowCurrent}
                    playing={rowCurrent && isPlaying}
                    onPlay={playItem}
                    onRemove={removeItem}
                />
            );
        },
        [current, isPlaying, playItem, removeItem],
    );

    return (
        <View style={landscape ? styles.rootFill : { height: portraitHeight }}>
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                {/* 与右侧两个按钮同为居中对齐：基线对齐会让标题组的文字线与按钮文字线错开 */}
                <Box row align="center" gap="sm" flex={1}>
                    <Text
                        size="xl"
                        weight="bold"
                        lineHeight="tight"
                        numberOfLines={1}
                    >
                        {t('playQueuePanel.title')}
                    </Text>
                    <Text size="sm" color="textSecondary">
                        {t('media.songCount', { count: queue.length })}
                    </Text>
                </Box>
                <Button
                    variant="ghost"
                    size="sm"
                    tone="neutral"
                    icon={REPEAT_ICON[repeatMode]}
                    style={styles.toolButton}
                    onPress={() => player.toggleRepeatMode().catch(() => {})}
                >
                    {t(`media.repeatMode.${REPEAT_LABEL[repeatMode]}`)}
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    tone="neutral"
                    icon="trash-2"
                    disabled={queue.length === 0}
                    style={styles.toolButton}
                    onPress={clear}
                >
                    {t('playQueuePanel.clear')}
                </Button>
            </View>
            <View style={styles.content}>
                {queue.length === 0 ? (
                    <ContentUnavailable
                        icon="list-music"
                        title={t('playQueuePanel.empty.title')}
                        description={t('playQueuePanel.empty.description')}
                    />
                ) : !entered ? (
                    // 进场期间只显 loading：大队列 FlashList 首帧渲染很重，压进开场会卡住滑入
                    <Loading variant="fullscreen" />
                ) : (
                    <FlashList
                        data={queue}
                        extraData={JSON.stringify([
                            current ? mediaKey(current) : null,
                            isPlaying,
                        ])}
                        initialScrollIndex={initialScrollIndex}
                        keyExtractor={mediaKey}
                        renderItem={renderItem}
                    />
                )}
            </View>
        </View>
    );
}

/** 播放队列浮层：`showPlayQueuePanel()`；从 MusicBar / musicDetail 的队列按钮拉起 */
export const showPlayQueuePanel = definePanel(PlayQueuePanelView);

const styles = StyleSheet.create({
    // 横屏右侧全高 sheet：整体撑满，让内容区 flex 生效
    rootFill: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        paddingLeft: layout.screenGutter,
        /** 右端 ghost Button 已收窄内距，补齐差额让其文字落回内容线 */
        paddingRight: space.sm,
        paddingBottom: space.md,
        /** 固定头部与滚动列表的轻分隔 */
        borderBottomWidth: borderWidth.hairline,
    },
    /** 标题行的密集工具位：sm 档默认的 lg 内距过肥，收到 sm 让两个按钮成组 */
    toolButton: {
        paddingHorizontal: space.sm,
    },
    content: {
        flex: 1,
        minHeight: 0,
    },
    // 「正在播放」律动条：当前曲标题行的 inline 前导，左缘与其它行标题一致；右侧留极小间距
    indicatorInline: {
        marginRight: space.xs,
    },
    // 标题占主、可省略；歌手次要、宽度不足时先被压缩（flexShrink 更大 → 先让位）
    title: {
        flexShrink: 1,
    },
    artist: {
        flexShrink: 2,
        maxWidth: '50%',
    },
});
