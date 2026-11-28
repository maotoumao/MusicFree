import { useEffect, useRef, useState, type ReactElement } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import PagerView, {
    type PagerViewOnPageScrollEvent,
    type PagerViewOnPageSelectedEvent,
} from 'react-native-pager-view';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '@/components/layout/Screen';
import { config } from '@/core/config';
import { useCurrentMusic } from '@/core/player';
import { layout, space } from '@/design';
import { useLayoutClass } from '@/hooks/useLayoutClass';
import { useT } from '@/i18n';
import { mediaKey } from '@/utils/media';

import { Backdrop } from './components/Backdrop';
import { CoverStage } from './components/CoverStage';
import { CoverTools } from './components/CoverTools';
import { KeepScreenAwake } from './components/KeepScreenAwake';
import { LyricTools } from './components/LyricTools';
import { LyricView } from './components/LyricView';
import { NowPlayingNav } from './components/NowPlayingNav';
import { NowPlayingPanes } from './components/NowPlayingPanes';
import { NOW_PLAYING_TOOLS_MENU } from './components/NowPlayingToolsMenu';
import { NowPlayingWide } from './components/NowPlayingWide';
import { PlayControls } from './components/PlayControls';
import { Progress } from './components/Progress';
import {
    PLAYER_COMPACT_BOTTOM,
    playerColumnFor,
    playerCompactNavLeadingFor,
    playerContentInsetFor,
    playerFormFor,
    playerPortraitNavRowFor,
} from './lib/layout';
import { type NowPlayingMode } from './lib/mode';

const modeToIndex = (m: NowPlayingMode) => (m === 'cover' ? 0 : 1);

/**
 * 与顶栏尾部两键配对的首部占位：左端只有一个返回键，右端是两键，
 * 不补上这段差额，中间的「封面 / 歌词」分段与跟手下划线会整体左偏。
 * 宽度由 playerCompactNavLeadingFor 定（窄窗口补不起时返回 0，见那里的说明）
 */
const NAV_LEADING_SPACERS = new Map<number, ReactElement>();
function navLeadingSpacer(width: number) {
    if (width <= 0) {
        return undefined;
    }
    // 缓存元素：顶栏是 memo 的，每次渲染造新 element 会让它恒失效
    let spacer = NAV_LEADING_SPACERS.get(width);
    if (!spacer) {
        spacer = <View style={{ width }} />;
        NAV_LEADING_SPACERS.set(width, spacer);
    }
    return spacer;
}

/**
 * 正在播放页：沉浸式当前曲
 *
 * - 手机竖屏 / 平板竖屏：封面 / 歌词双模式（左右滑或顶栏切换）
 * - 手机横屏 / 矮到翻页版塞不下的窗口：封面独占左栏 + 右栏一列到底（NowPlayingPanes）
 * - 手机分屏等矮而不宽的窗口：仍翻页，但换上短窗口 chrome
 * - 平板横屏：封面与歌词并排（NowPlayingWide）
 */
export default function MusicDetailScreen() {
    const layoutClass = useLayoutClass();
    // 每次进入按配置定初值（是「默认显示」不是「记住上次」）
    // 取快照而非订阅：设置页改动不该把正开着的页面顶回默认屏
    // 状态放在常驻的外层：横竖屏往返会重挂翻页版，用户临时切到的页不该被顶回默认
    const [mode, setMode] = useState<NowPlayingMode>(
        () => config.get('musicDetail.defaultView') ?? 'cover',
    );
    if (layoutClass === 'tabletLandscape') {
        return <NowPlayingWide />;
    }
    if (layoutClass === 'tabletPortrait') {
        return <NowPlayingPortraitTablet mode={mode} onModeChange={setMode} />;
    }
    return <NowPlayingPhone mode={mode} onModeChange={setMode} />;
}

/**
 * 手机：按窗口尺寸再分三形态（判据见 lib/layout 的 playerFormFor）
 *
 * 竖屏（tall）的**渲染**与改造前完全一致——不传任何新 prop，静态样式原样。
 * 但这一层确实多了一个连续尺寸订阅：`useWindowDimensions` 挂在所有手机形态上（含 tall），
 * 故窗口尺寸每变一次（旋转、分屏拖分隔条）这一页都会重渲一次。这是形态判据的必要代价——
 * `useLayoutClass` 那种「只在类别变化时重渲」在这里不够用，因为判据吃的是连续 dp。
 * 两个 hook 都读同一个 `Dimensions.get('window')`，故不会拼出「旧尺寸 + 新类别」的中间帧
 */
function NowPlayingPhone(props: {
    mode: NowPlayingMode;
    onModeChange: (mode: NowPlayingMode) => void;
}) {
    const { width, height } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const form = playerFormFor(width, height);
    if (form === 'panes') {
        return <NowPlayingPanes />;
    }
    // 竖屏不传（保持静态样式原样）；短窗口按可用宽决定顶栏首部占位
    const navLeading =
        form === 'compact'
            ? playerCompactNavLeadingFor(width - insets.left - insets.right)
            : 0;
    return (
        <NowPlayingPager
            {...props}
            compact={form === 'compact'}
            navLeading={navLeading}
        />
    );
}

/**
 * 平板竖屏：翻页版 + 把 560 内容列居中的对称内距
 */
function NowPlayingPortraitTablet(props: {
    mode: NowPlayingMode;
    onModeChange: (mode: NowPlayingMode) => void;
}) {
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    // 可用宽扣掉左右安全区（Screen 已恒缩）
    const contentInset = playerContentInsetFor(
        width - insets.left - insets.right,
    );
    return <NowPlayingPager {...props} contentInset={contentInset} />;
}

/** 翻页版（手机竖屏原样；平板竖屏由外层传入居中内距；矮窗口传 compact 收紧 chrome） */
function NowPlayingPager({
    mode,
    onModeChange: setMode,
    contentInset,
    compact = false,
    navLeading = 0,
}: {
    mode: NowPlayingMode;
    onModeChange: (mode: NowPlayingMode) => void;
    /** 平板竖屏：页面与底部控件的左右内距（手机不传，静态样式原样） */
    contentInset?: number;
    /**
     * 矮窗口（手机分屏 / 窄横窗口）：顶栏收到 44、两条工具行让位给溢出菜单、
     * 播放键收到 56、页面底距收到 12——每一页因此各多出 104dp 给封面与歌词
     * （顶栏 8 + 页面组间距 12 + 工具行 60 + 底部组间距 4 + 播放键 8 + 底距 12；
     * 两条工具行分别在两页上，同一时刻只占一条的 60）
     */
    compact?: boolean;
    /** 短窗口：顶栏首部占位宽（dp），0 = 不放；竖屏不传 */
    navLeading?: number;
}) {
    const insets = useSafeAreaInsets();
    const t = useT();
    const current = useCurrentMusic();

    const pagerRef = useRef<PagerView>(null);
    // 分页滚动位置 0..1，驱动顶栏下划线跟手
    const pagerPosition = useSharedValue(modeToIndex(mode));
    // 原生当前页索引：仅当目标页与之不同才命令切页，免滑动落定后回补一次多余 setPage
    const settledIndex = useRef(modeToIndex(mode));

    // 顶栏点选 → mode 变 → 同步切页（滑动落定走 onPageSelected、不会二次 setPage）
    useEffect(() => {
        const target = modeToIndex(mode);
        if (target !== settledIndex.current) {
            pagerRef.current?.setPage(target);
        }
    }, [mode]);

    const artwork = current?.artwork;
    const title = current?.title ?? t('media.unknownTitle');
    // 平板竖屏：翻页页面与底部控件用对称内距把 560 内容列居中（手机 undefined，静态样式原样）
    const column =
        contentInset === undefined ? undefined : playerColumnFor(contentInset);
    const pageStyle = column ? [styles.page, column] : styles.page;
    // 手机竖屏（无 column、非 compact）恒走最后一支，拿到注册过的那个 style 对象本身
    const bottomStyle = compact
        ? [styles.bottom, styles.bottomCompact]
        : column
        ? [styles.bottom, column]
        : styles.bottom;

    const onPageScroll = (e: PagerViewOnPageScrollEvent) => {
        pagerPosition.value = e.nativeEvent.position + e.nativeEvent.offset;
    };
    const onPageSelected = (e: PagerViewOnPageSelectedEvent) => {
        settledIndex.current = e.nativeEvent.position;
        setMode(e.nativeEvent.position === 0 ? 'cover' : 'lyric');
    };

    return (
        <Screen background="coverVeil" edges={[]}>
            <KeepScreenAwake />
            <Backdrop artwork={artwork} />
            <View
                style={[
                    styles.content,
                    { paddingTop: insets.top, paddingBottom: insets.bottom },
                ]}
            >
                <NowPlayingNav
                    position={pagerPosition}
                    mode={mode}
                    onModeChange={setMode}
                    compact={compact}
                    trailing={compact ? NOW_PLAYING_TOOLS_MENU : undefined}
                    leading={navLeadingSpacer(navLeading)}
                    rowStyle={
                        contentInset === undefined
                            ? undefined
                            : playerPortraitNavRowFor(contentInset)
                    }
                />
                <PagerView
                    ref={pagerRef}
                    style={styles.pager}
                    initialPage={modeToIndex(mode)}
                    overScrollMode="never"
                    onPageScroll={onPageScroll}
                    onPageSelected={onPageSelected}
                >
                    <View key="cover" style={pageStyle}>
                        <CoverStage
                            artwork={artwork}
                            title={title}
                            artist={current?.artist}
                            platform={current?.platform}
                        />
                        {/* 矮窗口：工具行让位（工具进顶栏的溢出菜单），省下的高度给封面 */}
                        {compact ? null : <CoverTools />}
                    </View>
                    <View key="lyric" style={pageStyle}>
                        <LyricView key={current ? mediaKey(current) : 'none'} />
                        {compact ? null : <LyricTools />}
                    </View>
                </PagerView>
                <View style={bottomStyle}>
                    <Progress key={current ? mediaKey(current) : 'none'} />
                    <PlayControls scale={compact ? 'compact' : 'regular'} />
                </View>
            </View>
        </Screen>
    );
}

const styles = StyleSheet.create({
    content: {
        flex: 1,
    },
    pager: {
        flex: 1,
    },
    page: {
        flex: 1,
        paddingHorizontal: layout.screenGutter,
        gap: space.md,
    },
    bottom: {
        paddingHorizontal: layout.screenGutter,
        paddingBottom: space.xl,
        gap: space.lg,
    },
    bottomCompact: {
        paddingBottom: PLAYER_COMPACT_BOTTOM,
        gap: space.md,
    },
});
