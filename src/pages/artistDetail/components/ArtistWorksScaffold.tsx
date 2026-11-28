import { useAtomValue } from 'jotai';
import { useLayoutEffect, useMemo, useState } from 'react';
import {
    StatusBar,
    StyleSheet,
    useWindowDimensions,
    View,
    type ViewStyle,
} from 'react-native';
import Animated, {
    Extrapolation,
    interpolate,
    useAnimatedScrollHandler,
    useAnimatedStyle,
    useDerivedValue,
    useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBar } from '@/components/layout/AppBar';
import { appBarHeightFor } from '@/components/layout/appBarLayout';
import { ImmersiveAppBar } from '@/components/layout/ImmersiveAppBar';
import { SubstrateLayer } from '@/components/layout/SubstrateLayer';
import { useOnSubstrate } from '@/components/layout/SubstrateScope';
import { Tabs, type TabItem } from '@/components/ui/Tabs';
import { chromeIsDarkAtom, layout, space, useColors, zIndex } from '@/design';
import { useCompactHeight } from '@/hooks/useCompactHeight';
import { useLayoutClass } from '@/hooks/useLayoutClass';
import { useT } from '@/i18n';

import { ArtistAlbumGrid } from './ArtistAlbumGrid';
import { ArtistMusicList } from './ArtistMusicList';
import { ArtistSidePane } from './ArtistSidePane';
import {
    ARTIST_COVER_HEIGHT,
    ImmersiveArtistHeader,
} from './ImmersiveArtistHeader';

import type { ArtistDetailSource } from '../hooks/useArtistDetailSource';
import type { ArtistMediaType } from '@/types';

/**
 * 手机横屏沿用的旧封顶：封面 + Tabs + 作品行居中限宽 640（phone 竖屏 < 此值即全宽）
 *
 * **知情欠账**：矮窗（手机横屏）下首页与 MediaList 已取消这道封顶、行铺满可用宽，
 * 本页没跟上——同一台手机横屏，首页列表铺满而歌手作品列表仍 640 居中留白。
 * 没一起改是因为本页要插件 + 联网才进得去，改完在本地验不了几何；
 * 且封面 coverInner 吃的是同一个封顶，放开要两处一起动，不是把这行改掉就完事
 */
const CONTENT_MAX_WIDTH = layout.listContentMaxWidth;
/** 平板竖屏：封面全宽、作品行走媒体行档（840 + 2×32） */
const TABLET_CONTENT_MAX_WIDTH = layout.listMaxWidth + layout.gutter.tablet * 2;
/** Tabs 浮层高 = ListHeader 里为它预留的占位高（点选区复用 hitTarget） */
const TABS_HEIGHT = layout.hitTarget;

/** tab key → 媒体类型词汇（复用 media.type，不另造「单曲/专辑」文案） */
const TAB_LABEL: Record<
    ArtistMediaType,
    'media.type.music' | 'media.type.album'
> = {
    music: 'media.type.music',
    album: 'media.type.album',
};

/**
 * 歌手作品编排：单 scrollY 驱动浮层 AppBar 淡入 + Tabs 从封面底滑到吸顶
 * activeType 条件渲染单曲列表 / 专辑网格（不叠放）；切 tab 归零滚动回封面态，数据在 Query 缓存、切回秒出
 * 封面 + Tabs 占位作各列表 ListHeader 随滚收起；单类型（visibleTypes 1）不渲染 Tabs
 */
export function ArtistWorksScaffold({
    source,
    onBack,
}: {
    source: ArtistDetailSource;
    onBack(): void;
}) {
    const t = useT();
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const window = useWindowDimensions();
    const onSubstrate = useOnSubstrate();
    const layoutClass = useLayoutClass();
    // 横屏用普通 AppBar，StatusBar 得自己渲染（页面 Screen 关了 statusBar，原本由 ImmersiveAppBar 承担）
    const chromeIsDark = useAtomValue(chromeIsDarkAtom);
    const { profile, visibleTypes, activeType, selectType, music, album } =
        source;
    const hasTabs = visibleTypes.length > 1;
    // 平板竖屏把封面 / Tabs / 作品行的封顶从旧的 640 放到媒体行档（手机沿用 640，样式对象原样）
    const tabletWidth = useMemo<ViewStyle | undefined>(
        () =>
            layoutClass === 'phone'
                ? undefined
                : { maxWidth: TABLET_CONTENT_MAX_WIDTH },
        [layoutClass],
    );

    const scrollY = useSharedValue(0);
    const onScroll = useAnimatedScrollHandler(e => {
        scrollY.value = e.contentOffset.y;
    });

    // 切 tab / 来源自动修正 activeType 后都归零滚动（回封面态）：放 effect 里，在旧列表卸载、解绑 onScroll 之后执行，避免惯性滚动写回旧偏移
    useLayoutEffect(() => {
        scrollY.value = 0;
    }, [activeType, scrollY]);

    // Tabs 浮层：从封面底随滚动上移，到 AppBar 下沿吸顶后保持
    // 必须与 ImmersiveAppBar 取同一个行高，否则矮窗下 Tabs 会吸在 AppBar 下沿之外
    const isCompact = useCompactHeight();
    const stickyTop = insets.top + appBarHeightFor(isCompact);
    // 防御极小屏：封面比 AppBar 下沿还矮时，展开位取 stickyTop、折叠距离为 0（Tabs 从一开始即吸顶）
    const expandedTop = Math.max(ARTIST_COVER_HEIGHT, stickyTop);
    const foldDistance = expandedTop - stickyTop;
    const tabsY = useDerivedValue(() =>
        foldDistance <= 0
            ? stickyTop
            : interpolate(
                  scrollY.value,
                  [0, foldDistance],
                  [expandedTop, stickyTop],
                  Extrapolation.CLAMP,
              ),
    );
    const tabsFloatStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: tabsY.value }],
    }));
    // 壁纸要和页面上的那张严丝合缝，就不能跟着本条一起走：本条被 translateY
    // 推到哪，壁纸层就反向推回去，等效于始终钉在窗口左上角
    const tabsSubstrateStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: -tabsY.value }],
    }));

    // 封面随滚上移收起：absolute 独立于列表——切 tab 换列表时封面不重挂、不闪
    const coverStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: -scrollY.value }],
    }));

    // 列表顶部让出封面 + Tabs 占位 + 首行留白（封面已移出列表、以 absolute 盖在此区）
    const contentContainerStyle = useMemo<ViewStyle>(
        () => ({
            paddingTop:
                ARTIST_COVER_HEIGHT + (hasTabs ? TABS_HEIGHT : 0) + space.md,
            paddingBottom: insets.bottom,
            maxWidth: CONTENT_MAX_WIDTH,
            width: '100%',
            alignSelf: 'center',
            ...tabletWidth,
        }),
        [insets.bottom, hasTabs, tabletWidth],
    );
    // 横屏：无折叠、无浮层，列表只留顶部呼吸与底部安全区
    const wideContentContainerStyle = useMemo<ViewStyle>(
        () => ({ paddingTop: space.md, paddingBottom: insets.bottom }),
        [insets.bottom],
    );
    // 横屏右栏实测宽：专辑网格的列数要按栏宽算，不能按整窗（否则 880 的栏里塞进 6 列）
    const [worksPaneWidth, setWorksPaneWidth] = useState(0);

    const tabItems: TabItem<ArtistMediaType>[] = visibleTypes.map(type => ({
        key: type,
        label: t(TAB_LABEL[type]),
    }));

    // 平板横屏：头像 / 简介固定为左栏，右栏 Tabs + 作品列表满高滚动；跳过折叠联动与 Tabs 浮层
    if (layoutClass === 'tabletLandscape') {
        return (
            <View style={styles.root}>
                <StatusBar
                    translucent
                    backgroundColor="transparent"
                    barStyle={chromeIsDark ? 'light-content' : 'dark-content'}
                />
                <AppBar
                    title={profile.name}
                    leading={{
                        icon: 'chevron-left',
                        label: t('common.back'),
                        onPress: onBack,
                    }}
                />
                <View style={styles.panes}>
                    <ArtistSidePane profile={profile} />
                    <View
                        style={styles.worksPane}
                        onLayout={e =>
                            setWorksPaneWidth(e.nativeEvent.layout.width)
                        }
                    >
                        {hasTabs ? (
                            <Tabs
                                items={tabItems}
                                value={activeType}
                                onChange={selectType}
                            />
                        ) : null}
                        {activeType === 'music' ? (
                            <ArtistMusicList
                                works={music}
                                onScroll={undefined}
                                contentContainerStyle={
                                    wideContentContainerStyle
                                }
                            />
                        ) : (
                            <ArtistAlbumGrid
                                works={album}
                                onScroll={undefined}
                                contentContainerStyle={
                                    wideContentContainerStyle
                                }
                                availableWidth={worksPaneWidth}
                            />
                        )}
                    </View>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.root}>
            {activeType === 'music' ? (
                <ArtistMusicList
                    works={music}
                    onScroll={onScroll}
                    contentContainerStyle={contentContainerStyle}
                />
            ) : (
                <ArtistAlbumGrid
                    works={album}
                    onScroll={onScroll}
                    contentContainerStyle={contentContainerStyle}
                />
            )}
            {/* 封面：absolute 盖在列表 paddingTop 区、随滚上移；独立于列表 → 切 tab 不重挂不闪；box-none 透传滚动手势 */}
            <Animated.View
                pointerEvents="box-none"
                style={[styles.cover, coverStyle]}
            >
                <View
                    pointerEvents="box-none"
                    style={
                        tabletWidth
                            ? [styles.coverInner, tabletWidth]
                            : styles.coverInner
                    }
                >
                    <ImmersiveArtistHeader profile={profile} />
                </View>
            </Animated.View>
            {hasTabs ? (
                <Animated.View style={[styles.tabsFloat, tabsFloatStyle]}>
                    {/* 与 ImmersiveAppBar 同一条规则：本条浮在列表之上、内容从它
                        下面滚过去，半透明透出的必须是壁纸而不是滚动的歌名 */}
                    <View style={styles.tabsClip}>
                        {onSubstrate ? (
                            <Animated.View
                                style={[styles.tabsFill, tabsSubstrateStyle]}
                            >
                                <SubstrateLayer
                                    width={window.width}
                                    height={window.height}
                                />
                            </Animated.View>
                        ) : null}
                        <View
                            style={[
                                styles.tabsFill,
                                { backgroundColor: colors.surface },
                            ]}
                        />
                    </View>
                    <View
                        style={
                            tabletWidth
                                ? [styles.tabsInner, tabletWidth]
                                : styles.tabsInner
                        }
                    >
                        <Tabs
                            items={tabItems}
                            value={activeType}
                            onChange={selectType}
                        />
                    </View>
                </Animated.View>
            ) : null}
            <ImmersiveAppBar
                key={activeType}
                scrollY={scrollY}
                coverHeight={ARTIST_COVER_HEIGHT}
                settleTop={stickyTop}
                title={profile.name}
                onBack={onBack}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    panes: {
        flex: 1,
        flexDirection: 'row',
    },
    worksPane: {
        flex: 1,
        minWidth: 0,
    },
    // 封面 absolute 盖列表顶部（随滚上移）；平板下与内容列同宽居中
    cover: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    coverInner: {
        width: '100%',
        maxWidth: CONTENT_MAX_WIDTH,
    },
    tabsFloat: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: TABS_HEIGHT,
        zIndex: zIndex.sticky,
    },
    /** 裁壁纸用；壁纸按整窗尺寸铺，且会被反向变换推出本条范围 */
    tabsClip: {
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        overflow: 'hidden',
    },
    tabsFill: {
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
    },
    // 平板下与内容列同宽居中；phone 全宽（maxWidth 不生效）
    tabsInner: {
        flex: 1,
        width: '100%',
        maxWidth: CONTENT_MAX_WIDTH,
        alignSelf: 'center',
    },
});
