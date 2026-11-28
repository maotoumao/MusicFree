import { useNavigation } from '@react-navigation/native';
import { useCallback, useEffect } from 'react';
import {
    StyleSheet,
    View,
    type LayoutChangeEvent,
    type ViewStyle,
} from 'react-native';
import {
    GestureDetector,
    useExclusiveGestures,
    usePanGesture,
    useTapGesture,
} from 'react-native-gesture-handler';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { IconButton, iconButtonEdgeInset } from '@/components/ui/IconButton';
import { MediaCover } from '@/components/ui/MediaCover';
import { Text } from '@/components/ui/Text';
import {
    PlaybackState,
    player,
    useCurrentMusic,
    usePlaybackState,
    useProgress,
    useQueue,
} from '@/core/player';
import { layout, space, useColors } from '@/design';
import { useCompactHeight } from '@/hooks/useCompactHeight';
import { useLayoutClass, type LayoutClass } from '@/hooks/useLayoutClass';
import { useT } from '@/i18n';

import { showPlayQueuePanel } from './overlays/PlayQueuePanel';

// 组件专属几何字面量（无对应 token）
const COVER = 40;
const PROGRESS_HEIGHT = 2;

/** 行的共有排布；两档行高各自 spread 出一份静态样式 */
const ROW_BASE = {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: space.md,
    /** 右侧是贴边图标按钮，外推后图标本体与左侧封面同在 md 内容线上 */
    paddingRight: iconButtonEdgeInset(space.md),
    gap: space.sm,
} as const;
// 横滑判定阈值
const ACTIVATE_X = 12;
const FAIL_Y = 8;
const TRIGGER_VELOCITY = 650;
const TRIGGER_MAX_DIST = 80;

/** 进度线独立订阅 useProgress：500ms tick 只重渲染这一条，不带动整条 bar */
function MusicBarProgress() {
    const colors = useColors();
    const progress = useProgress();
    const fraction =
        progress.duration > 0
            ? Math.min(1, Math.max(0, progress.position / progress.duration))
            : 0;
    return (
        <View
            style={[styles.track, { backgroundColor: colors.surfaceVariant }]}
        >
            <View
                style={[
                    styles.trackFill,
                    {
                        backgroundColor: colors.primary,
                        width: `${fraction * 100}%`,
                    },
                ]}
            />
        </View>
    );
}

/**
 * 迷你播放条：贴底展示当前曲 + 传输控制，主区横滑切歌、点按进播放详情
 * drop-in widget，页面按需引入；无当前曲时不渲染
 */
export function MusicBar() {
    const t = useT();
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const navigation = useNavigation();
    const current = useCurrentMusic();
    // 平板：条本身仍通栏铺 surface，内容收进与列表同一媒体行列（手机 undefined，styles.row 原样）
    const rowLayout = musicBarRowLayoutFor(useLayoutClass());
    // 矮窗（手机横屏）换矮档行高：封面 40 与图标按钮 44 都仍放得下，命中区不变
    const rowBase = useCompactHeight() ? styles.rowCompact : styles.row;
    const state = usePlaybackState();
    const queue = useQueue();

    // 队列多于一首才有可切；shuffle / 单曲下的精确「下一首」由引擎兜，UI 只判有无
    const canSkip = queue.length > 1;

    const translateX = useSharedValue(0);
    const mainWidth = useSharedValue(0);
    // 供手势 worklet 读取的可切标记（React 态不能直接进 worklet）
    const canSkipShared = useSharedValue(canSkip);
    useEffect(() => {
        canSkipShared.value = canSkip;
    }, [canSkip, canSkipShared]);

    const openDetail = useCallback(
        () => navigation.navigate('MusicDetail'),
        [navigation],
    );
    const skipNext = useCallback(() => {
        player.skipToNext().catch(() => {});
    }, []);
    const skipPrev = useCallback(() => {
        player.skipToPrevious().catch(() => {});
    }, []);
    const openQueue = useCallback(() => {
        showPlayQueuePanel();
    }, []);

    // 手势回调是 worklet，经 scheduleOnRN 回 JS 切歌 / 进详情
    const pan = usePanGesture({
        activeOffsetX: [-ACTIVATE_X, ACTIVATE_X],
        failOffsetY: [-FAIL_Y, FAIL_Y],
        onUpdate: e => {
            'worklet';
            // 不可切时强阻尼，示意「到头了」而非跟手滑走
            translateX.value = canSkipShared.value
                ? e.translationX
                : e.translationX * 0.15;
        },
        onDeactivate: e => {
            'worklet';
            // 仅识别成功（非取消 / 被父手势抢占）才切歌
            if (e.canceled || !canSkipShared.value) {
                return;
            }
            const w = mainWidth.value || 1;
            const farEnough =
                Math.abs(e.translationX) >=
                Math.min(0.25 * w, TRIGGER_MAX_DIST);
            const fastEnough = Math.abs(e.velocityX) >= TRIGGER_VELOCITY;
            // 方向须明显水平，避免竖滑误判
            const horizontal =
                Math.abs(e.velocityX) >= 1.5 * Math.abs(e.velocityY);
            if ((farEnough || fastEnough) && horizontal) {
                if (e.translationX < 0) {
                    scheduleOnRN(skipNext);
                } else {
                    scheduleOnRN(skipPrev);
                }
            }
        },
        onFinalize: () => {
            'worklet';
            // 结束 / 取消都回弹：clamp 过冲，settle 回 0 不来回晃
            translateX.value = withSpring(0, {
                damping: 30,
                stiffness: 220,
                overshootClamping: true,
            });
        },
    });
    const tap = useTapGesture({
        maxDistance: 8,
        onActivate: () => {
            'worklet';
            scheduleOnRN(openDetail);
        },
    });
    const gesture = useExclusiveGestures(pan, tap);

    const mainAnimated = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    if (!current) {
        return null;
    }

    // 播放意图（含缓冲 / 加载）→ 主按钮走暂停；仅暂停 / 停止 / 空闲 / 错误才走播放
    const inPlayback =
        state === PlaybackState.Playing ||
        state === PlaybackState.Buffering ||
        state === PlaybackState.Loading;
    const isBuffering =
        state === PlaybackState.Buffering || state === PlaybackState.Loading;
    const subtitle = [current.artist, current.album]
        .filter(Boolean)
        .join(' · ');
    const playIcon = state === PlaybackState.Playing ? 'pause' : 'play';
    const mainLabel = isBuffering
        ? t('musicBar.a11y.buffering', { title: current.title })
        : state === PlaybackState.Playing
        ? t('musicBar.a11y.playing', { title: current.title })
        : state === PlaybackState.Paused
        ? t('musicBar.a11y.paused', { title: current.title })
        : t('musicBar.a11y.current', { title: current.title });

    return (
        <View
            style={{
                backgroundColor: colors.surface,
                paddingBottom: insets.bottom,
            }}
        >
            <MusicBarProgress />
            <View style={rowLayout ? [rowBase, rowLayout] : rowBase}>
                <GestureDetector gesture={gesture}>
                    <Animated.View
                        style={[styles.main, mainAnimated]}
                        onLayout={(e: LayoutChangeEvent) => {
                            mainWidth.value = e.nativeEvent.layout.width;
                        }}
                        accessible
                        accessibilityRole="button"
                        accessibilityLabel={mainLabel}
                        accessibilityActions={[
                            {
                                name: 'activate',
                                label: t('musicBar.a11y.openPlayer'),
                            },
                            ...(canSkip
                                ? [
                                      {
                                          name: 'previous',
                                          label: t('musicBar.a11y.previous'),
                                      },
                                      {
                                          name: 'next',
                                          label: t('musicBar.a11y.next'),
                                      },
                                  ]
                                : []),
                        ]}
                        onAccessibilityAction={e => {
                            const action = e.nativeEvent.actionName;
                            if (action === 'next') {
                                skipNext();
                            } else if (action === 'previous') {
                                skipPrev();
                            } else {
                                openDetail();
                            }
                        }}
                    >
                        <MediaCover
                            source={current.artwork}
                            fallbackIcon="disc-3"
                            round
                            size={COVER}
                        />
                        <View style={styles.textCol}>
                            <Text size="md" numberOfLines={1}>
                                {current.title}
                            </Text>
                            {subtitle ? (
                                <Text
                                    size="xs"
                                    color="textSecondary"
                                    numberOfLines={1}
                                >
                                    {subtitle}
                                </Text>
                            ) : null}
                        </View>
                    </Animated.View>
                </GestureDetector>
                <IconButton
                    icon={playIcon}
                    busy={isBuffering}
                    accessibilityLabel={
                        inPlayback ? t('musicBar.a11y.pause') : t('common.play')
                    }
                    onPress={() => {
                        if (inPlayback) {
                            player.pause().catch(() => {});
                        } else {
                            player.play().catch(() => {});
                        }
                    }}
                />
                <IconButton
                    icon="list-music"
                    accessibilityLabel={t('musicBar.a11y.queue')}
                    onPress={openQueue}
                />
            </View>
        </View>
    );
}

/**
 * 平板上播放条内容行的对齐（纯计算）：与媒体行列表同一列（840 + 2×32），
 * 左右各在手机内距（md / 贴边图标外推）之上再补「平板内容线 − 手机内容线」的差额。
 * 用 paddingLeft / paddingRight 而非 paddingHorizontal：RN 里前者优先级更高，
 * 否则 styles.row 的 paddingLeft 会把 paddingHorizontal 盖掉。手机恒 undefined
 */
export function musicBarRowLayoutFor(
    layoutClass: LayoutClass,
): ViewStyle | undefined {
    if (layoutClass === 'phone') {
        return undefined;
    }
    const extra = layout.gutter.tablet - layout.gutter.compact;
    return {
        width: '100%',
        maxWidth: layout.listMaxWidth + layout.gutter.tablet * 2,
        alignSelf: 'center',
        paddingLeft: space.md + extra,
        paddingRight: iconButtonEdgeInset(space.md) + extra,
    };
}

const styles = StyleSheet.create({
    track: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: PROGRESS_HEIGHT,
        zIndex: 1,
    },
    trackFill: {
        height: '100%',
    },
    row: { ...ROW_BASE, height: layout.miniPlayerHeight },
    /** 矮窗档：只换高度，内容线与排布不变 */
    rowCompact: { ...ROW_BASE, height: layout.miniPlayerCompactHeight },
    main: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'stretch',
        gap: space.md,
        minWidth: 0,
    },
    textCol: {
        flex: 1,
        minWidth: 0,
        rowGap: space.xs,
    },
});
