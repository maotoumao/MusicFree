import { useAtomValue } from 'jotai';
import { type ReactNode } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import {
    chromeIsDarkAtom,
    useColors,
    useHasBackgroundLayer,
    type Colors,
} from '@/design';
import { colord } from '@/utils/color';

import { SubstrateLayer } from './SubstrateLayer';
import { SubstrateScope } from './SubstrateScope';

interface ScreenProps {
    /** 页面全屏背景语义 token（默认 background）；铺满整窗（含状态栏后方） */
    background?: keyof Colors;
    /**
     * 安全区内缩边，**只管上下**；默认上下都缩，沉浸式页去掉 top
     * 左右恒缩、不受本 prop 控制——见 HORIZONTAL_EDGES
     */
    edges?: readonly ('top' | 'bottom')[];
    /** 状态栏图标色：auto=按背景亮度自动（任意 background token 都正确）；light/dark=强制 */
    statusBarStyle?: 'light' | 'dark' | 'auto';
    /** false = 本屏自管状态栏（如集合详情页由滚动联动的 AppBar 自渲染 StatusBar），Screen 不渲染、避免双源 */
    statusBar?: boolean;
    children: ReactNode;
}

const DEFAULT_EDGES: readonly ('top' | 'bottom')[] = ['top', 'bottom'];

/**
 * 左右安全区**恒缩**，不交给 `edges` 控制
 *
 * 上下要能被关掉是有理由的：沉浸式页要让封面顶到状态栏后面。左右没有这种诉求——
 * 横屏时刘海 / 挖孔在侧边，把正文推进去只是让人读不到，没有任何观感收益。
 * 此前全仓 34 处 `edges` 全是 `[]` 或 `['bottom']`，等于左右一律不缩，
 * iPhone 横屏刘海侧的内容直接进不可见区。
 * 全屏背景层（SubstrateLayer / Backdrop）绝对定位在 SafeAreaView 之外，照常出血
 */
const HORIZONTAL_EDGES: readonly Edge[] = ['left', 'right'];

/**
 * 页面壳：全屏背景 + 安全区内缩 + 状态栏
 * edge-to-edge：状态栏始终 translucent，其后方区域显示本页全屏背景
 *
 * 壁纸由**每个页面自己**铺，而不是在导航树外铺一层、各页透明地叠上去：
 * 屏容器一旦透明，`slide_from_right` 转场期间下面那一屏的内容会透过新屏可见。
 * 各页都是满窗、壁纸按同一规则 cover，静止态看不出区别。
 */
export function Screen({
    background = 'background',
    edges = DEFAULT_EDGES,
    statusBarStyle = 'auto',
    statusBar = true,
    children,
}: ScreenProps) {
    const colors = useColors();
    const hasThemedBackground = useHasBackgroundLayer();
    // 状态栏后方铺的是顶栏的 surface（必要时再压在壁纸上），既不是裸壁纸也不是底色 token。
    // 用默认底色的页面全都带 AppBar——唯一没有 AppBar 的沉浸播放页用的是 coverVeil，走下面那支
    const chromeIsDark = useAtomValue(chromeIsDarkAtom);
    const onSubstrate = hasThemedBackground && background === 'background';
    const darkBackground =
        background === 'background'
            ? chromeIsDark
            : colord(colors[background]).isDark();
    const barStyle =
        statusBarStyle === 'auto'
            ? darkBackground
                ? 'light-content'
                : 'dark-content'
            : statusBarStyle === 'light'
            ? 'light-content'
            : 'dark-content';
    return (
        <View style={[styles.root, { backgroundColor: colors[background] }]}>
            {/* 壁纸铺在安全区之外：绝对定位以内边距盒为参照，放进 SafeAreaView 会一起缩进去 */}
            {onSubstrate ? <SubstrateLayer /> : null}
            {statusBar ? (
                <StatusBar
                    translucent
                    backgroundColor="transparent"
                    barStyle={barStyle}
                />
            ) : null}
            {/* 只有真正透出壁纸的页面才让文字吃自适配阴影：模态浮层与沉浸播放页背后没有壁纸 */}
            <SubstrateScope onSubstrate={onSubstrate}>
                <SafeAreaView
                    edges={[...edges, ...HORIZONTAL_EDGES]}
                    style={styles.content}
                >
                    {children}
                </SafeAreaView>
            </SubstrateScope>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    content: { flex: 1 },
});
