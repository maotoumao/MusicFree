/**
 * 歌词画布：随播放高亮 + 居中滚动；拖动列表滑到某行、点右侧定位键跳转（唯一 seek 入口）
 * 内容 / 当前行来自 core/lyric；纯文本歌词无时间轴、只静态展示不可定位
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Pressable,
    ScrollView,
    StyleSheet,
    View,
    type LayoutChangeEvent,
    type NativeScrollEvent,
    type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
    interpolate,
    interpolateColor,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';

import { IconButton, iconButtonEdgeInset } from '@/components/ui/IconButton';
import { Spinner } from '@/components/ui/Spinner';
import { Text } from '@/components/ui/Text';
import { useConfig, type ConfigSchema } from '@/core/config';
import { useCurrentLyricLine, useLyric, useLyricOffset } from '@/core/lyric';
import { player, useCurrentMusic, useDuration } from '@/core/player';
import {
    duration,
    easing,
    fontSize,
    fontWeight,
    layout,
    lineHeightMultiplier,
    radius,
    space,
    useColors,
} from '@/design';
import { useT } from '@/i18n';
import { colord } from '@/utils/color';
import { formatDuration } from '@/utils/time';
import { showLyricSearchPanel } from '@/widgets/overlays/LyricSearchPanel';

// 顶/底透明度渐隐长度（Android fadingEdgeLength；几何字面量）
const FADE_EDGE_LENGTH = 64;
// 拖拽停止后 scrub 指示条保留时长，随后恢复自动居中
const SCRUB_LINGER_MS = 1800;
// seek 后等待当前行追上的兑底超时（接近末尾等永追不上时解除抑制）
const SEEK_SETTLE_MS = 1200;

/**
 * 当前行的放大幅度
 *
 * 不进 design token：只此一处在用，而 `pressScale` 那两档是「按压反馈」的语义、方向相反
 * （0.97 / 0.9 是缩小）。按前端架构规范 4.7「组件几何不进 token」留在组件内
 */
const ACTIVE_LINE_SCALE = 1.05;

/** 歌词行字号档位 → design 字号 token */
const LYRIC_FONT_SIZE_TOKEN = {
    small: 'md',
    standard: 'lg',
    large: 'xl',
    xlarge: '2xl',
} as const satisfies Record<
    ConfigSchema['lyric.fontSize'],
    keyof typeof fontSize
>;

const LyricLine = memo(function LyricLineBase({
    index,
    text,
    translation,
    showTranslation,
    active,
    dimColor,
    activeColor,
    sizeStyle,
    onLayout,
}: {
    index: number;
    text: string;
    translation?: string;
    showTranslation: boolean;
    active: boolean;
    dimColor: string;
    activeColor: string;
    sizeStyle: { fontSize: number; lineHeight: number };
    onLayout: (index: number, y: number, height: number) => void;
}) {
    // 0=非激活（次文字色） 1=激活（强调色 + 轻微放大），平滑过渡
    const progress = useSharedValue(active ? 1 : 0);
    useEffect(() => {
        progress.value = withTiming(active ? 1 : 0, {
            duration: duration.base,
            easing: easing.standard,
        });
    }, [active, progress]);
    /*
     * 当前行走 `coverAccent`（跟随主题主色），并**保留 1.05 缩放**
     *
     * 缩放不能删：`coverAccent` 的派生只调 HSL 明度、原样保留色相与饱和度
     * （见 resolveThemeColors 的 adjustForContrast），所以它**不承诺有色相**——
     * 用户把主色设成灰或近白，accent 就是灰或近白（实测 #e0e0e0 原样派生成 #e0e0e0），
     * 而全部歌词行共用同一个 fontWeight：只靠颜色的话，那一档连「哪一行在放」都指不出来
     * （具体到多弱要看封面与位置，数值见 docs/design/music-detail.md）
     *
     * 缩放是 paint-time 的，跑 UI 线程、不参与 Yoga 布局，故 onLayout 量到的高度与
     * 居中滚动 / 拖拽定位那套坐标都不受影响——换来的是「色相**或**尺寸」二者必有其一生效
     */
    const animStyle = useAnimatedStyle(() => ({
        color: interpolateColor(
            progress.value,
            [0, 1],
            [dimColor, activeColor],
        ),
        transform: [
            {
                scale: interpolate(
                    progress.value,
                    [0, 1],
                    [1, ACTIVE_LINE_SCALE],
                ),
            },
        ],
    }));
    const handleLayout = (e: LayoutChangeEvent) => {
        const { y, height } = e.nativeEvent.layout;
        onLayout(index, y, height);
    };
    // 显示译文时原文/译文同一 Text 换行叠放（共享高亮与缩放，onLayout 量到合并高度）
    const content =
        showTranslation && translation ? `${text}\n${translation}` : text;
    return (
        <Animated.Text
            allowFontScaling={false}
            onLayout={handleLayout}
            style={[styles.line, sizeStyle, animStyle]}
        >
            {content}
        </Animated.Text>
    );
});

export const LyricView = memo(function LyricViewBase() {
    const t = useT();
    const colors = useColors();
    const fontSizeLevel = useConfig('lyric.fontSize') ?? 'standard';
    // 字号档位对应行字号和固定行高；档位变化后由 onContentSizeChange 重新测量并居中
    const lineSizeStyle = useMemo(() => {
        const size = fontSize[LYRIC_FONT_SIZE_TOKEN[fontSizeLevel]];
        return {
            fontSize: size,
            lineHeight: size * lineHeightMultiplier.normal,
        };
    }, [fontSizeLevel]);
    const showTranslation = useConfig('lyric.showTranslation') ?? false;
    const { status, lines, timed } = useLyric();
    const { index: activeIndex } = useCurrentLyricLine();
    const { effective: offset } = useLyricOffset();
    const totalDuration = useDuration();
    // 纯文本歌词无时间轴：可滚动浏览但不弹 scrub、不可定位
    const canSeek =
        timed &&
        lines.length > 0 &&
        Number.isFinite(totalDuration) &&
        totalDuration > 0;

    const scrollRef = useRef<ScrollView>(null);
    const [viewportH, setViewportH] = useState(0);
    // 各行内容坐标（y + 高）：居中滚动与拖拽定位用，ref 避免布局回调触发重渲
    const lineLayouts = useRef<{ y: number; height: number }[]>([]);
    // 用户是否正在滑动（含惯性 + 余韵）：区分自动滚动，自动滚动不弹 scrub
    const userScrolling = useRef(false);
    const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // 拖拽命中的居中行号（null=不显示）：驱动 scrub 指示条
    const [scrubIndex, setScrubIndex] = useState<number | null>(null);
    // seek 后停留的目标行：抑制自动居中回跳，等 core 当前行追上再解除
    const [pendingSeek, setPendingSeek] = useState<number | null>(null);

    const scrollToLine = useCallback(
        (i: number, animated: boolean) => {
            const l = lineLayouts.current[i];
            if (!l || viewportH === 0) {
                return;
            }
            const y = Math.max(0, l.y + l.height / 2 - viewportH / 2);
            scrollRef.current?.scrollTo({ y, animated });
        },
        [viewportH],
    );

    // 居中目标：拖拽中暂停；seek 后停在目标行等追上；否则跟当前行
    useEffect(() => {
        if (scrubIndex !== null) {
            return;
        }
        if (pendingSeek !== null) {
            scrollToLine(pendingSeek, true);
            return;
        }
        if (activeIndex >= 0) {
            scrollToLine(activeIndex, true);
        }
    }, [activeIndex, scrubIndex, pendingSeek, scrollToLine]);

    // 当前行追上 seek 目标 → 解除抑制
    useEffect(() => {
        if (pendingSeek !== null && activeIndex === pendingSeek) {
            setPendingSeek(null);
        }
    }, [activeIndex, pendingSeek]);

    useEffect(() => {
        return () => {
            if (dismissTimer.current) {
                clearTimeout(dismissTimer.current);
            }
            if (settleTimer.current) {
                clearTimeout(settleTimer.current);
            }
        };
    }, []);

    const onLineLayout = useCallback((i: number, y: number, height: number) => {
        lineLayouts.current[i] = { y, height };
    }, []);

    const findCenterIndex = useCallback(
        (scrollY: number): number => {
            const target = scrollY + viewportH / 2;
            for (let i = 0; i < lines.length; i++) {
                const l = lineLayouts.current[i];
                if (l && target < l.y + l.height) {
                    return i;
                }
            }
            return lines.length - 1;
        },
        [lines.length, viewportH],
    );

    const scheduleScrubDismiss = useCallback(() => {
        if (dismissTimer.current) {
            clearTimeout(dismissTimer.current);
        }
        dismissTimer.current = setTimeout(() => {
            userScrolling.current = false;
            setScrubIndex(null);
        }, SCRUB_LINGER_MS);
    }, []);

    // 拖拽开始即建立 scrub（立刻暂停自动居中，堵住 begin→首帧 onScroll 的竞态窗口）
    const onScrollBeginDrag = useCallback(
        (e: NativeSyntheticEvent<NativeScrollEvent>) => {
            if (!canSeek) {
                return;
            }
            userScrolling.current = true;
            setPendingSeek(null);
            if (dismissTimer.current) {
                clearTimeout(dismissTimer.current);
                dismissTimer.current = null;
            }
            setScrubIndex(findCenterIndex(e.nativeEvent.contentOffset.y));
        },
        [canSeek, findCenterIndex],
    );

    const onScroll = useCallback(
        (e: NativeSyntheticEvent<NativeScrollEvent>) => {
            if (!userScrolling.current) {
                return;
            }
            if (dismissTimer.current) {
                clearTimeout(dismissTimer.current);
                dismissTimer.current = null;
            }
            setScrubIndex(findCenterIndex(e.nativeEvent.contentOffset.y));
        },
        [findCenterIndex],
    );

    // 内容尺寸变化（首次布局 / 切换译文）时把目标行居中；延一帧确保各行 onLayout 已更新
    // lineLayouts（onContentSizeChange 可能早于子行 onLayout 派发），再按最新交互态复核
    const onContentSizeChange = useCallback(() => {
        const target = pendingSeek ?? activeIndex;
        if (target < 0) {
            return;
        }
        requestAnimationFrame(() => {
            if (userScrolling.current || scrubIndex !== null) {
                return;
            }
            scrollToLine(target, false);
        });
    }, [scrubIndex, pendingSeek, activeIndex, scrollToLine]);

    const scrubTarget = scrubIndex != null ? lines[scrubIndex] ?? null : null;
    const scrubPosition =
        canSeek && scrubTarget && Number.isFinite(scrubTarget.time + offset)
            ? Math.min(totalDuration, Math.max(0, scrubTarget.time + offset))
            : null;

    // 定位：跳到 scrub 命中行并播放；停在目标行等当前行追上（不回跳）
    const handleScrubSeek = useCallback(() => {
        if (scrubIndex == null || scrubPosition == null) {
            return;
        }
        const line = lines[scrubIndex];
        if (line) {
            setPendingSeek(scrubIndex);
            player.seekTo(scrubPosition).catch(() => {});
            player.play().catch(() => {});
            if (settleTimer.current) {
                clearTimeout(settleTimer.current);
            }
            settleTimer.current = setTimeout(
                () => setPendingSeek(null),
                SEEK_SETTLE_MS,
            );
        }
        if (dismissTimer.current) {
            clearTimeout(dismissTimer.current);
            dismissTimer.current = null;
        }
        userScrolling.current = false;
        setScrubIndex(null);
    }, [scrubIndex, lines, scrubPosition]);

    const currentMusic = useCurrentMusic();
    const openSearchLyric = useCallback(() => {
        if (currentMusic) {
            showLyricSearchPanel({ item: currentMusic });
        }
    }, [currentMusic]);

    const spacer = viewportH / 2;
    const pillBg = colord(colors.coverVeil).alpha(0.72).toRgbString();
    const scrubTime =
        scrubPosition != null ? formatDuration(scrubPosition) : '';
    const empty =
        status === 'unavailable' || (status === 'loaded' && lines.length === 0);
    // wrap 恒挂载测量 viewportH：viewportH 未就绪(=0)就渲歌词会以 spacer=0 顶对齐、随后闪一下才居中
    // loading/空态期间已把 viewportH 量好，切歌 remount 后歌词一出即居中
    const ready = status === 'loaded' && lines.length > 0 && viewportH > 0;
    return (
        <View
            style={styles.wrap}
            onLayout={e => setViewportH(e.nativeEvent.layout.height)}
        >
            {empty ? (
                <View style={styles.center}>
                    <Text size="lg" color="coverText">
                        {t('musicDetail.noLyric')}
                    </Text>
                    <Pressable
                        onPress={openSearchLyric}
                        accessibilityRole="button"
                        accessibilityLabel={t('musicDetail.searchLyric')}
                        style={styles.searchHint}
                    >
                        <Text size="md" color="coverAccent">
                            {t('musicDetail.searchLyric')}
                        </Text>
                    </Pressable>
                </View>
            ) : ready ? (
                <>
                    <ScrollView
                        ref={scrollRef}
                        showsVerticalScrollIndicator={false}
                        overScrollMode="never"
                        fadingEdgeLength={FADE_EDGE_LENGTH}
                        scrollEventThrottle={32}
                        onScrollBeginDrag={onScrollBeginDrag}
                        onScroll={onScroll}
                        onScrollEndDrag={scheduleScrubDismiss}
                        onMomentumScrollEnd={scheduleScrubDismiss}
                        onContentSizeChange={onContentSizeChange}
                    >
                        <View style={{ height: spacer }} />
                        {lines.map((line, i) => (
                            <LyricLine
                                key={i}
                                index={i}
                                text={line.text}
                                translation={line.translation}
                                showTranslation={showTranslation}
                                active={i === activeIndex}
                                dimColor={colors.coverTextSecondary}
                                activeColor={colors.coverAccent}
                                sizeStyle={lineSizeStyle}
                                onLayout={onLineLayout}
                            />
                        ))}
                        <View style={{ height: spacer }} />
                    </ScrollView>
                    {scrubPosition != null ? (
                        <View
                            pointerEvents="box-none"
                            style={[
                                styles.scrub,
                                { top: (viewportH - layout.hitTarget) / 2 },
                            ]}
                        >
                            <Text
                                size="sm"
                                color="coverText"
                                pointerEvents="none"
                                style={[
                                    styles.scrubTime,
                                    { backgroundColor: pillBg },
                                ]}
                            >
                                {scrubTime}
                            </Text>
                            <View
                                pointerEvents="none"
                                style={[
                                    styles.scrubTrack,
                                    { backgroundColor: colors.coverBorder },
                                ]}
                            />
                            <IconButton
                                icon="play"
                                size="sm"
                                tone="coverText"
                                onPress={handleScrubSeek}
                                accessibilityLabel={`${t(
                                    'musicDetail.a11y.seekToLine',
                                )} ${scrubTime}`}
                            />
                        </View>
                    ) : null}
                </>
            ) : (
                <View style={styles.center}>
                    <Spinner size="lg" color="coverTextSecondary" />
                </View>
            )}
        </View>
    );
});

const styles = StyleSheet.create({
    wrap: {
        flex: 1,
    },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.md,
    },
    searchHint: {
        minHeight: layout.hitTarget,
        justifyContent: 'center',
        paddingHorizontal: space.md,
    },
    line: {
        fontWeight: fontWeight.medium,
        textAlign: 'center',
        paddingVertical: space.md,
        paddingHorizontal: space.lg,
        includeFontPadding: false,
    },
    scrub: {
        position: 'absolute',
        /** 负 left/right 抵消歌词页 gutter，令行内容满幅铺开 */
        left: -layout.screenGutter,
        right: -layout.screenGutter,
        height: layout.hitTarget,
        flexDirection: 'row',
        alignItems: 'center',
        /** 时间 pill 是实心内容，落在内容线上；右端定位键按 sm 图标外推 */
        paddingLeft: layout.screenGutter,
        paddingRight: iconButtonEdgeInset(layout.screenGutter, 'sm'),
        gap: space.sm,
    },
    scrubTime: {
        fontVariant: ['tabular-nums'],
        paddingHorizontal: space.sm,
        paddingVertical: space.xs,
        borderRadius: radius.sm,
        overflow: 'hidden',
    },
    scrubTrack: {
        flex: 1,
        height: StyleSheet.hairlineWidth,
    },
});
