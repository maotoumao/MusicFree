import { useNavigation } from '@react-navigation/native';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import {
    Animated,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
    useWindowDimensions,
    type LayoutChangeEvent,
} from 'react-native';
import {
    TabView,
    type NavigationState,
    type SceneRendererProps,
} from 'react-native-tab-view';

import { ContentUnavailable } from '@/components/ui/ContentUnavailable';
import { Text } from '@/components/ui/Text';
import { usePluginsWithMethods } from '@/core/plugin';
import { borderWidth, layout, space, useColors } from '@/design';
import { useGutterExtra } from '@/hooks/useContentColumn';
import { useT } from '@/i18n';

import type { Plugin, PluginMethodName } from '@/core/plugin';

/** pager 路由：一条 = 一个具备所需方法的启用源；title 用 platform 展示名 */
type SourceRoute = { key: string; title: string };

/** tab 相对 ScrollView content 的位置与宽度（= 标签宽，用于下划线紧贴 + 居中滚入） */
interface TabRect {
    x: number;
    width: number;
}

/**
 * 源下划线 tab（自绘 renderTabBar）：tab 命中容器 minWidth 44dp、标签居中；下划线贴 tab 宽（长名=标签宽、短名=44）
 * 下划线用 tab-view 的 position（原生驱动，只动画 transform：translateX 定位 + scaleX 表宽）插值到实测 tab rect、跟手；选中项自动居中滚入
 * 长源名 maxWidth 截断省略；仅 >1 源时渲染（单源无需切换，PluginSourcePager 不挂它）
 */
function SourceTabBar({
    navigationState,
    position,
    jumpTo,
}: SceneRendererProps & { navigationState: NavigationState<SourceRoute> }) {
    const colors = useColors();
    const { width: windowWidth } = useWindowDimensions();
    // 平板：首尾 Tab 与页面内容线（32）对齐；手机 undefined、沿用 16
    const gutterExtra = useGutterExtra();
    const scrollRef = useRef<ScrollView>(null);
    const viewportWidth = useRef(0);
    const [rects, setRects] = useState<Record<string, TabRect>>({});
    const { routes, index } = navigationState;

    const measure = useCallback((key: string, e: LayoutChangeEvent) => {
        const { x, width } = e.nativeEvent.layout;
        setRects(prev => {
            const cur = prev[key];
            if (cur && cur.x === x && cur.width === width) {
                return prev;
            }
            return { ...prev, [key]: { x, width } };
        });
    }, []);

    // 选中项居中滚入视野（viewport / 布局异步到达时重试）
    const scrollActiveIntoView = useCallback(() => {
        const activeKey = routes[index]?.key;
        const r = activeKey ? rects[activeKey] : undefined;
        const vw = viewportWidth.current;
        if (r && vw > 0) {
            scrollRef.current?.scrollTo({
                x: Math.max(0, r.x + r.width / 2 - vw / 2),
                animated: true,
            });
        }
    }, [rects, routes, index]);
    useEffect(() => {
        scrollActiveIntoView();
    }, [scrollActiveIntoView]);

    // 全部 tab 测完才定位下划线；任一未测 → 隐藏
    // 只动画 transform（原生驱动不支持动画 width）：translateX 定位 tab 中心、scaleX 从基准宽 1 缩到 tab 宽
    const indicatorStyle = useMemo(() => {
        const known: TabRect[] = [];
        for (const route of routes) {
            const r = rects[route.key];
            if (!r) {
                return null;
            }
            known.push(r);
        }
        // 单源固定；>=2 用 position 跟手插值（clamp 防源缩减瞬间外推越界）
        const first = known[0];
        if (known.length === 1 && first) {
            return {
                transform: [
                    { translateX: first.x + first.width / 2 },
                    { scaleX: first.width },
                ],
            };
        }
        const inputRange = known.map((_, i) => i);
        return {
            transform: [
                {
                    translateX: position.interpolate({
                        inputRange,
                        outputRange: known.map(r => r.x + r.width / 2),
                        extrapolate: 'clamp',
                    }),
                },
                {
                    scaleX: position.interpolate({
                        inputRange,
                        outputRange: known.map(r => r.width),
                        extrapolate: 'clamp',
                    }),
                },
            ],
        };
    }, [rects, routes, position]);

    return (
        <View
            style={{
                backgroundColor: colors.surface,
                borderBottomColor: colors.border,
                borderBottomWidth: borderWidth.hairline,
            }}
        >
            <ScrollView
                ref={scrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={
                    gutterExtra
                        ? [styles.barContent, gutterExtra]
                        : styles.barContent
                }
                onLayout={e => {
                    viewportWidth.current = e.nativeEvent.layout.width;
                    scrollActiveIntoView();
                }}
                accessibilityRole="tablist"
            >
                {routes.map((route, i) => {
                    const selected = i === index;
                    return (
                        <Pressable
                            key={route.key}
                            onPress={() => jumpTo(route.key)}
                            onLayout={e => measure(route.key, e)}
                            accessibilityRole="tab"
                            accessibilityState={{ selected }}
                            style={styles.tabItem}
                        >
                            <Text
                                size="md"
                                weight={selected ? 'bold' : 'medium'}
                                numberOfLines={1}
                                color={selected ? 'text' : 'textSecondary'}
                                style={{ maxWidth: windowWidth * 0.6 }}
                            >
                                {route.title}
                            </Text>
                        </Pressable>
                    );
                })}
                {indicatorStyle ? (
                    <Animated.View
                        pointerEvents="none"
                        style={[
                            styles.indicator,
                            { backgroundColor: colors.primary },
                            indicatorStyle,
                        ]}
                    />
                ) : null}
            </ScrollView>
        </View>
    );
}

interface PluginSourcePagerProps {
    /** 源资格：具备这些方法（全部）的启用插件才作为源（如榜单 [getTopLists, getTopListDetail]） */
    methods: readonly PluginMethodName[];
    /** 渲染单个源的内容（该源自持数据 / 状态；每源一个 scene 实例，切回恢复） */
    renderSource: (plugin: Plugin) => ReactNode;
}

/**
 * 插件源横滑切换骨架（widget）：按方法集筛启用源 → 顶部下划线源 TabBar（可滚动 + 跟手）+ 内容 pager 横滑切源
 * 无可用源 → ContentUnavailable 引导管理插件；当前源失效自动回落首个可用
 * 榜单 / 推荐页共用；源内容（分组网格 / tag + 网格）由调用方经 renderSource 注入
 */
export function PluginSourcePager({
    methods,
    renderSource,
}: PluginSourcePagerProps) {
    const t = useT();
    const navigation = useNavigation();
    const { width } = useWindowDimensions();

    const sources = usePluginsWithMethods(methods);
    // 记当前源 platform（稳定身份；下标随源增删失配）
    const [activePlatform, setActivePlatform] = useState<string>();

    const routes = useMemo<SourceRoute[]>(
        () => sources.map(p => ({ key: p.platform, title: p.platform })),
        [sources],
    );
    const sourceByPlatform = useMemo(
        () => new Map(sources.map(p => [p.platform, p])),
        [sources],
    );

    // 当前源不在可用列表（增删 / 启停 / 更新）→ 回落首个可用
    useEffect(() => {
        const fallback = routes[0]?.key;
        if (fallback && !routes.some(r => r.key === activePlatform)) {
            setActivePlatform(fallback);
        }
    }, [routes, activePlatform]);

    const index = Math.max(
        0,
        routes.findIndex(r => r.key === activePlatform),
    );

    const handleIndexChange = useCallback(
        (next: number) => {
            const key = routes[next]?.key;
            if (key !== undefined) {
                setActivePlatform(key);
            }
        },
        [routes],
    );

    const renderScene = useCallback(
        ({ route }: SceneRendererProps & { route: SourceRoute }) => {
            const plugin = sourceByPlatform.get(route.key);
            return plugin ? renderSource(plugin) : null;
        },
        [sourceByPlatform, renderSource],
    );

    const renderTabBar = useCallback(
        (
            props: SceneRendererProps & {
                navigationState: NavigationState<SourceRoute>;
            },
        ) => {
            const { routes: r } = props.navigationState;
            // 单源无需切换 → 不渲染 tab bar，直接显示该源内容
            // key 绑源集合签名：增删 / 重排源时重挂，避免上一代 tab 测量残留错位
            return r.length > 1 ? (
                <SourceTabBar key={r.map(x => x.key).join('|')} {...props} />
            ) : null;
        },
        [],
    );

    if (routes.length === 0) {
        return (
            <ContentUnavailable
                icon="list-music"
                title={t('pluginSourcePager.noSource')}
                description={t('pluginSourcePager.noSourceHint')}
                action={{
                    label: t('common.managePlugins'),
                    onPress: () => navigation.navigate('PluginManager'),
                }}
                style={styles.fill}
            />
        );
    }

    return (
        <TabView
            style={styles.fill}
            navigationState={{ index, routes }}
            renderScene={renderScene}
            renderTabBar={renderTabBar}
            onIndexChange={handleIndexChange}
            lazy
            initialLayout={{ width }}
        />
    );
}

const styles = StyleSheet.create({
    fill: { flex: 1 },
    barContent: {
        alignItems: 'center',
        height: layout.hitTarget,
        gap: space.xl,
        paddingHorizontal: space.lg,
    },
    // 命中容器 minWidth 44、标签居中；高填满 bar 使命中达 hitTarget
    tabItem: {
        minWidth: layout.hitTarget,
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    // 绝对定位 bar 底；基准宽 1，实际宽 / 位移由 transform（scaleX + translateX）驱动
    indicator: {
        position: 'absolute',
        bottom: 0,
        height: 2,
        width: 1,
    },
});
