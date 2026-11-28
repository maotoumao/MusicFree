import { LinearGradient } from 'expo-linear-gradient';
import { useAtomValue } from 'jotai';
import { useState } from 'react';
import { StatusBar, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
    Extrapolation,
    interpolate,
    useAnimatedReaction,
    useAnimatedStyle,
    type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { SubstrateLayer } from '@/components/layout/SubstrateLayer';
import { useOnSubstrate } from '@/components/layout/SubstrateScope';
import { Icon } from '@/components/ui/Icon';
import { IconButton, iconButtonEdgeInset } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import {
    borderWidth,
    chromeIsDarkAtom,
    layout,
    space,
    useColors,
    zIndex,
} from '@/design';
import { useCompactHeight } from '@/hooks/useCompactHeight';
import { useLayoutClass } from '@/hooks/useLayoutClass';
import { useT } from '@/i18n';
import { colord } from '@/utils/color';

import { appBarHeightFor, appBarRowStyleFor } from './appBarLayout';

import type { IconName } from '@/components/ui/icons.generated';
import type { ContentColumnKind } from '@/hooks/useContentColumn';

/** 行内边距：两端图标按钮外推后，图标本体落在内容线上 */
const ROW_INSET = iconButtonEdgeInset(layout.screenGutter);

/** 行的共有排布；两档行高各自 spread 出一份静态样式 */
const ROW_BASE = {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: ROW_INSET,
} as const;

/** 浮层 AppBar 的行内图标动作；封面态强制白图标，故不设 tone */
export interface ImmersiveAppBarAction {
    icon: IconName;
    /** 无障碍 label */
    label: string;
    onPress(): void;
}

interface ImmersiveAppBarProps {
    /** 列表滚动位移（reanimated shared value，页面从列表 onScroll 驱动） */
    scrollY: SharedValue<number>;
    /** 封面高度：AppBar 据此定位「封面态→实底态」过渡带 */
    coverHeight: number;
    /** AppBar 完全实底时封面底停靠的目标 y：默认状态栏底(insets.top)；有吸顶元素接在 AppBar 下沿时传其吸顶位，令 AppBar 与之同步实底 */
    settleTop?: number;
    title: string;
    onBack(): void;
    /** 行内常驻图标动作，自左向右渲染于 ⋮ 左侧 */
    actions?: readonly ImmersiveAppBarAction[];
    /** 有 → 渲染 overflow ⋮（内容由调用方接） */
    onOverflow?(): void;
    /** 平板上行内内容对齐到哪一档内容列（同 AppBar）；不传 = 行满宽、内距升平板档 */
    contentWidth?: ContentColumnKind;
}

/** AppBar 图标按钮：底层 IconButton（实底态主题色 + 处理点击）叠上层白图标（封面态，随滚动淡出） */
function AppBarButton({
    icon,
    label,
    onPress,
    scrollY,
    transitionStart,
    transitionEnd,
}: {
    icon: IconName;
    label: string;
    onPress(): void;
    scrollY: SharedValue<number>;
    transitionStart: number;
    transitionEnd: number;
}) {
    // 封面态白图标随滚动淡出，露出底层主题色 IconButton
    const overlayStyle = useAnimatedStyle(() => ({
        opacity: interpolate(
            scrollY.value,
            [transitionStart, transitionEnd],
            [1, 0],
            Extrapolation.CLAMP,
        ),
    }));
    return (
        <View style={styles.slot}>
            <IconButton
                icon={icon}
                accessibilityLabel={label}
                onPress={onPress}
            />
            <Animated.View
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, styles.overlay, overlayStyle]}
            >
                <Icon name={icon} size="md" color="coverText" />
            </Animated.View>
        </View>
    );
}

/**
 * 沉浸详情页浮层 AppBar（集合 / 歌手详情共用）：绝对定位盖在封面上，随滚动透明→实底 + 标题淡入
 * 封面态顶部暗 scrim（coverScrim）+ 白图标保证可读；滚到实底换主题色实底 + 主题色图标 + 标题
 * 复用 IconButton / Text 与 AppBar 的尺寸 token；不改静态 AppBar（两者行为根本不同）
 */
export function ImmersiveAppBar({
    scrollY,
    coverHeight,
    settleTop,
    title,
    onBack,
    actions,
    onOverflow,
    contentWidth,
}: ImmersiveAppBarProps) {
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const window = useWindowDimensions();
    const layoutClass = useLayoutClass();
    // 平板：行内内容对齐到内容列（手机恒 undefined → 仍传原来的 styles.row 单值，prop 也一字不变）
    const rowLayout = appBarRowStyleFor(layoutClass, contentWidth);
    // 矮窗（手机横屏）换矮档：行高、过渡带带宽与 scrim 高都以它为准，三者必须同一个数
    const isCompact = useCompactHeight();
    const barHeight = appBarHeightFor(isCompact);
    const rowBase = isCompact ? styles.rowCompact : styles.row;
    // 只有真的坐在页面基底上才自带壁纸：宿主若不是透出壁纸的 Screen（如组件画廊
    // 里的裸容器），铺一条壁纸就成了「无壁纸页面上的一条壁纸带」
    const onSubstrate = useOnSubstrate();
    const t = useT();
    // 无尾部动作时标题区右侧无物可靠，需自补到内容线（与静态 AppBar 同一处理）
    const hasTrailing = (actions?.length ?? 0) > 0 || onOverflow != null;
    // 过渡带 = 封面底边扫过 AppBar 的那段滚动：终点为封面底边升到 settleTop（默认状态栏底、扣刘海；有吸顶 Tabs 时为 AppBar 下沿，令 AppBar 与 Tabs 吸顶同步实底），起点前推一个 AppBar 行高
    const transitionEnd = Math.max(
        coverHeight - (settleTop ?? insets.top),
        barHeight,
    );
    const transitionStart = Math.max(transitionEnd - barHeight, 0);
    // scrim 平滑收尾（无实色平台）：同色相只变 alpha 从顶端柔和渐隐至透明护状态栏 / 白图标；效果优先取偏柔强度（免顶部暗块），免硬边、免与封面底 scrim 交叠死黑
    const scrimColors = [
        colord(colors.coverScrim).alpha(0.58).toRgbString(),
        colord(colors.coverScrim).alpha(0.5).toRgbString(),
        colord(colors.coverScrim).alpha(0.22).toRgbString(),
        colord(colors.coverScrim).alpha(0).toRgbString(),
    ] as const;
    const scrimLocations = [0, 0.45, 0.8, 1] as const;

    // 状态栏图标色随滚动翻：封面 / scrim（暗）上用浅色；滚到实底（colors.surface）按主题——浅色模式实底浅、须转深色图标才看得清
    // barStyle 是离散 prop，在过渡带中点翻：react 每帧都调，用 past !== previous 只在跨阈值时 setState（免每帧 runOnJS 跨线程）
    // 实底态的 surface 有壁纸时是半透明的，按它压在基底上的合成色判向才不会选反
    const surfaceBarStyle = useAtomValue(chromeIsDarkAtom)
        ? 'light-content'
        : 'dark-content';
    const statusBarThreshold = (transitionStart + transitionEnd) / 2;
    const [pastCover, setPastCover] = useState(false);
    useAnimatedReaction(
        () => scrollY.value >= statusBarThreshold,
        (past, previous) => {
            if (past !== previous) {
                scheduleOnRN(setPastCover, past);
            }
        },
        [statusBarThreshold],
    );

    const scrimStyle = useAnimatedStyle(() => ({
        opacity: interpolate(
            scrollY.value,
            [transitionStart, transitionEnd],
            [1, 0],
            Extrapolation.CLAMP,
        ),
    }));
    const surfaceStyle = useAnimatedStyle(() => ({
        opacity: interpolate(
            scrollY.value,
            [transitionStart, transitionEnd],
            [0, 1],
            Extrapolation.CLAMP,
        ),
    }));
    const titleStyle = useAnimatedStyle(() => ({
        opacity: interpolate(
            scrollY.value,
            [transitionStart, transitionEnd],
            [0, 1],
            Extrapolation.CLAMP,
        ),
    }));

    return (
        <View
            pointerEvents="box-none"
            style={[styles.root, { paddingTop: insets.top }]}
        >
            <StatusBar
                translucent
                backgroundColor="transparent"
                barStyle={pastCover ? surfaceBarStyle : 'light-content'}
            />
            <Animated.View
                pointerEvents="none"
                style={[
                    styles.scrim,
                    { height: insets.top + barHeight * 2 },
                    scrimStyle,
                ]}
            >
                <LinearGradient
                    colors={scrimColors}
                    locations={scrimLocations}
                    style={StyleSheet.absoluteFill}
                />
            </Animated.View>
            {/* 实底态：本栏浮在列表之上、内容从它下面滚过去，故必须自带一份壁纸——
                否则「控件不透明度」透出的是滚动的歌名而不是背景。图层按窗口尺寸
                定位在左上角，而本栏就贴着窗口顶部，露出的正好是页面上同一块。
                壁纸与实色同吃 surfaceStyle：滚到顶本栏该全透时，不能有壁纸糊在封面上。

                needsOffscreenAlphaCompositing：安卓默认把父级 alpha 逐层施加到每个
                绘制层，而不是先合成子树再整体上 alpha。壁纸 / 实色 / 分割线是几层
                互相重叠的元素，逐层施加会让本栏在过渡中段远比进度更实（0.5 处实际
                遮盖约 0.73），颜色也不是干净的 cross-fade。RN 文档点名的正是这个场景 */}
            <Animated.View
                pointerEvents="none"
                needsOffscreenAlphaCompositing
                style={[StyleSheet.absoluteFill, surfaceStyle]}
            >
                {/* 裁剪层不带边框，边界即本栏整盒：分割线画在它里面才有实色垫底。
                    若改回父层的 borderBottomWidth，绝对定位的子层高度会是
                    「父高 − 边框」、正好让开那一行，分割线背后就只剩滚动的列表；
                    而 border 色本身是 10% 上下的半透明，那一行会直接透出歌名 */}
                <View style={styles.surfaceClip}>
                    {onSubstrate ? (
                        <SubstrateLayer
                            width={window.width}
                            height={window.height}
                        />
                    ) : null}
                    <View
                        style={[
                            StyleSheet.absoluteFill,
                            { backgroundColor: colors.surface },
                        ]}
                    />
                    <View
                        style={[
                            styles.divider,
                            { backgroundColor: colors.border },
                        ]}
                    />
                </View>
            </Animated.View>
            <View style={rowLayout ? [rowBase, rowLayout] : rowBase}>
                <AppBarButton
                    icon="chevron-left"
                    label={t('common.back')}
                    onPress={onBack}
                    scrollY={scrollY}
                    transitionStart={transitionStart}
                    transitionEnd={transitionEnd}
                />
                <Animated.View
                    pointerEvents="none"
                    style={[
                        styles.center,
                        hasTrailing ? null : styles.centerToGutter,
                        titleStyle,
                    ]}
                    accessibilityElementsHidden={!pastCover}
                    importantForAccessibility={
                        pastCover ? 'auto' : 'no-hide-descendants'
                    }
                >
                    <Text
                        size="lg"
                        weight="bold"
                        numberOfLines={1}
                        style={styles.title}
                    >
                        {title}
                    </Text>
                </Animated.View>
                {actions?.map(action => (
                    <AppBarButton
                        key={action.label}
                        icon={action.icon}
                        label={action.label}
                        onPress={action.onPress}
                        scrollY={scrollY}
                        transitionStart={transitionStart}
                        transitionEnd={transitionEnd}
                    />
                ))}
                {onOverflow ? (
                    <AppBarButton
                        icon="ellipsis-vertical"
                        label={t('common.more')}
                        onPress={onOverflow}
                        scrollY={scrollY}
                        transitionStart={transitionStart}
                        transitionEnd={transitionEnd}
                    />
                ) : null}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: zIndex.sticky,
    },
    scrim: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
    },
    /** 只负责裁壁纸；不带边框，故绝对定位的子层能盖满整盒（含分割线那一行） */
    surfaceClip: {
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        overflow: 'hidden',
    },
    divider: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: borderWidth.hairline,
    },
    row: { ...ROW_BASE, height: layout.appBarHeight },
    /** 矮窗档：只换高度，内容线与排布不变 */
    rowCompact: { ...ROW_BASE, height: layout.appBarCompactHeight },
    slot: {
        width: layout.hitTarget,
        alignItems: 'center',
        justifyContent: 'center',
    },
    overlay: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    center: {
        flex: 1,
    },
    /** 无 overflow 时把标题区自身补到内容线（长标题不能贴到壳边距上） */
    centerToGutter: {
        marginRight: layout.screenGutter - ROW_INSET,
    },
    title: {
        /** 接在 leading 槽(44)之后固定留白，与静态 AppBar 的标题起点一致 */
        marginLeft: space.lg,
    },
});
