import { useNavigation } from '@react-navigation/native';
import { Fragment, memo, type ReactNode } from 'react';
import {
    Pressable,
    StyleSheet,
    View,
    type LayoutChangeEvent,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import Animated, {
    Extrapolation,
    interpolate,
    useAnimatedStyle,
    useSharedValue,
    type SharedValue,
} from 'react-native-reanimated';

import { IconButton, iconButtonEdgeInset } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { player } from '@/core/player';
import { layout, radius, space, useColors } from '@/design';
import { useT } from '@/i18n';
import { showSharePosterPanel } from '@/widgets/overlays/SharePosterPanel';

import { PLAYER_COMPACT_NAV_HEIGHT, PLAYER_NAV_HEIGHT } from '../lib/layout';
import { type NowPlayingMode } from '../lib/mode';

const UNDERLINE_WIDTH = 18;
const MODES: readonly NowPlayingMode[] = ['cover', 'lyric'];

interface NowPlayingNavProps {
    /** 分页滚动位置 0..1（0=封面 1=歌词），驱动下划线跟手滑动 */
    position: SharedValue<number>;
    /** 当前视图模式（页面持有） */
    mode: NowPlayingMode;
    onModeChange: (mode: NowPlayingMode) => void;
    /** 平板横屏封面与歌词并排、无需切换：隐藏中间分段，占位保留让两端图标不位移（默认显示） */
    showModeSwitch?: boolean;
    /** 平板：行内容对齐到页面内容列（手机不传，静态样式原样） */
    rowStyle?: StyleProp<ViewStyle>;
    /** 短窗口（手机横屏 / 分屏）：行高收一档（默认走 52 的竖屏档） */
    compact?: boolean;
    /**
     * 替换尾部的分享键（短窗口传「收藏 + 更多」）
     * 分享在那两种形态里进「更多」面板，不在顶栏单占一个位
     */
    trailing?: ReactNode;
    /**
     * 首部占位：`trailing` 比默认的单个图标键宽时传等宽的空占位，
     * 否则中间那段 `flex: 1` 会被挤偏，切换分段与跟手下划线整体离开顶栏光学中心
     */
    leading?: ReactNode;
    /**
     * 无切换时中段放什么（默认空占位）
     * 分栏形态在窄到标题挤不进右栏时把标题放这儿——不然当前曲目在页面上无处可见，
     * 读屏也读不到（`showModeSwitch` 为 true 时忽略）
     */
    middle?: ReactNode;
}

/** 顶栏：返回 · 封面/歌词切换（细分隔线 + 跟手下划线）· 分享 */
export const NowPlayingNav = memo(function NowPlayingNavBase({
    position,
    mode,
    onModeChange,
    showModeSwitch = true,
    rowStyle,
    compact = false,
    trailing,
    leading,
    middle,
}: NowPlayingNavProps) {
    const navigation = useNavigation();
    const colors = useColors();
    const t = useT();

    // 两 tab 中心 x（onLayout 测量），与分页位置插值出下划线位置
    const coverCenter = useSharedValue(0);
    const lyricCenter = useSharedValue(0);

    const inkStyle = useAnimatedStyle(() => {
        const c0 = coverCenter.value;
        const c1 = lyricCenter.value;
        if (c0 === 0 || c1 === 0) {
            return { opacity: 0 };
        }
        const x = interpolate(
            position.value,
            [0, 1],
            [c0, c1],
            Extrapolation.CLAMP,
        );
        return {
            opacity: 1,
            transform: [{ translateX: x - UNDERLINE_WIDTH / 2 }],
        };
    });

    const onTabLayout = (m: NowPlayingMode) => (e: LayoutChangeEvent) => {
        const { x, width } = e.nativeEvent.layout;
        const center = x + width / 2;
        if (m === 'cover') {
            coverCenter.value = center;
        } else {
            lyricCenter.value = center;
        }
    };

    // 手机竖屏（无 rowStyle、非 compact）恒走 else 分支，拿到注册过的那个 style 对象本身
    const navStyle = compact
        ? [styles.nav, styles.navCompact, rowStyle]
        : rowStyle
        ? [styles.nav, rowStyle]
        : styles.nav;
    return (
        <View style={navStyle}>
            <IconButton
                icon="chevron-left"
                tone="coverText"
                accessibilityLabel={t('common.back')}
                onPress={() => navigation.goBack()}
            />
            {leading}
            {showModeSwitch ? (
                <View style={styles.seg} accessibilityRole="tablist">
                    {MODES.map((m, i) => (
                        <Fragment key={m}>
                            {i > 0 ? (
                                <View
                                    style={[
                                        styles.divider,
                                        { backgroundColor: colors.coverBorder },
                                    ]}
                                />
                            ) : null}
                            <Pressable
                                onPress={() => onModeChange(m)}
                                onLayout={onTabLayout(m)}
                                accessibilityRole="tab"
                                accessibilityLabel={t(`musicDetail.${m}`)}
                                accessibilityState={{ selected: mode === m }}
                                style={styles.tab}
                            >
                                {/* 可收缩 + 单行：极窄顶栏（320dp 窗口再带横屏刘海）里
                                    标签宁可省略号，也不能顶到两端的图标键上——
                                    RN 子节点默认 flexShrink: 0，不写这两笔就会重叠 */}
                                <Text
                                    size="md"
                                    weight="medium"
                                    numberOfLines={1}
                                    color={
                                        mode === m
                                            ? 'coverText'
                                            : 'coverTextSecondary'
                                    }
                                    style={styles.tabLabel}
                                >
                                    {t(`musicDetail.${m}`)}
                                </Text>
                            </Pressable>
                        </Fragment>
                    ))}
                    <Animated.View
                        pointerEvents="none"
                        style={[
                            styles.ink,
                            { backgroundColor: colors.coverAccent },
                            inkStyle,
                        ]}
                    />
                </View>
            ) : (
                <View style={styles.seg}>{middle}</View>
            )}
            {trailing ?? (
                <IconButton
                    icon="share-2"
                    tone="coverText"
                    accessibilityLabel={t('common.share')}
                    onPress={() => {
                        // 按下那一刻才取当前曲：默认尾键这条路上顶栏不展示曲目信息，
                        // 没必要为它订阅切歌（短窗口传进来的 NowPlayingToolsMenu 自己订阅，
                        // 那是它要显示收藏态与各项可用性的代价，与本键无关）
                        const current = player.getCurrentMusic();
                        if (current) {
                            showSharePosterPanel({
                                title: current.title,
                                artist: current.artist,
                                artwork: current.artwork,
                            });
                        }
                    }}
                />
            )}
        </View>
    );
});

const styles = StyleSheet.create({
    nav: {
        height: PLAYER_NAV_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        /** 两端是贴边图标按钮，外推后图标本体与页面内容线对齐 */
        paddingHorizontal: iconButtonEdgeInset(layout.screenGutter),
    },
    navCompact: {
        height: PLAYER_COMPACT_NAV_HEIGHT,
    },
    seg: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
    tab: {
        minHeight: layout.hitTarget,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: space.sm,
        flexShrink: 1,
    },
    tabLabel: {
        flexShrink: 1,
    },
    divider: {
        width: 1,
        height: 12,
        marginHorizontal: space.xs,
    },
    ink: {
        position: 'absolute',
        bottom: 6,
        left: 0,
        width: UNDERLINE_WIDTH,
        height: 2.5,
        borderRadius: radius.full,
    },
});
