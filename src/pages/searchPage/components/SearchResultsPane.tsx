import { useNavigation } from '@react-navigation/native';
import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { TabView } from 'react-native-tab-view';

import { ChipRow } from '@/components/ui/ChipRow';
import { ContentUnavailable } from '@/components/ui/ContentUnavailable';
import { Tabs } from '@/components/ui/Tabs';
import { useSearchablePlugins } from '@/core/plugin';
import { useLayoutClass } from '@/hooks/useLayoutClass';
import { useT } from '@/i18n';

import { SEARCH_TYPES } from '../lib/searchTypes';

import { SearchResults } from './SearchResults';
import { SourceDirectory } from './SourceDirectory';

import type { SearchType } from '../lib/searchTypes';
import type { TabItem } from '@/components/ui/Tabs';
import type {
    NavigationState,
    SceneRendererProps,
} from 'react-native-tab-view';

/** pager 路由：一条 = 一个支持当前类型的启用源 */
type SourceRoute = { key: string; title: string };

/**
 * 结果态编排：类型 Tab（点选）在上，源 pager（swipe + pill）在下
 * 两轴——切类型重配源列表并尽量保留当前源（不支持则回落首个）；源经 pager 惰性加载
 * pager 按 type 重挂，保证换类型时各源 scene 全新（不泄漏旧滚动位）；下标由源标识派生，换类型仍能保留源
 */
export function SearchResultsPane({ query }: { query: string }) {
    const t = useT();
    const navigation = useNavigation();
    const { width } = useWindowDimensions();
    const layoutClass = useLayoutClass();
    const [type, setType] = useState<SearchType>('music');
    // 记来源 platform（稳定身份；hash 随更新变、下标随切类型失配）
    const [activeSourcePlatform, setActiveSourcePlatform] = useState<string>();

    const sources = useSearchablePlugins(type);
    const routes = useMemo<SourceRoute[]>(
        () => sources.map(p => ({ key: p.platform, title: p.platform })),
        [sources],
    );
    const sourceByPlatform = useMemo(
        () => new Map(sources.map(p => [p.platform, p])),
        [sources],
    );

    // 当前来源不在可用列表里（切类型 / 启停 / 增删更新）→ 回落到首个可用来源
    useEffect(() => {
        const fallback = routes[0]?.key;
        if (fallback && !routes.some(r => r.key === activeSourcePlatform)) {
            setActiveSourcePlatform(fallback);
        }
    }, [routes, activeSourcePlatform]);

    const index = Math.max(
        0,
        routes.findIndex(r => r.key === activeSourcePlatform),
    );

    const typeTabs: TabItem<SearchType>[] = SEARCH_TYPES.map(key => ({
        key,
        label: t(`media.type.${key}`),
    }));
    const sourceItems = useMemo(
        () => routes.map(r => ({ key: r.key, label: r.title })),
        [routes],
    );

    const handleIndexChange = useCallback(
        (next: number) => {
            const key = routes[next]?.key;
            if (key !== undefined) {
                setActiveSourcePlatform(key);
            }
        },
        [routes],
    );
    const renderScene = useCallback(
        ({ route }: SceneRendererProps & { route: SourceRoute }) => {
            const plugin = sourceByPlatform.get(route.key);
            return plugin ? (
                <SearchResults source={plugin} type={type} query={query} />
            ) : null;
        },
        [sourceByPlatform, type, query],
    );
    const renderTabBar = useCallback(
        (
            props: SceneRendererProps & {
                navigationState: NavigationState<SourceRoute>;
            },
        ) => {
            const { routes: r, index: i } = props.navigationState;
            const activeKey = r[i]?.key;
            return r.length > 1 && activeKey !== undefined ? (
                <ChipRow
                    items={sourceItems}
                    activeKey={activeKey}
                    onSelect={props.jumpTo}
                />
            ) : null;
        },
        [sourceItems],
    );

    const noSource = (
        <ContentUnavailable
            icon="search"
            title={t('search.noSource')}
            description={t('search.noSourceHint')}
            action={{
                label: t('common.managePlugins'),
                onPress: () => navigation.navigate('PluginManager'),
            }}
            style={styles.fill}
        />
    );

    // 平板横屏 + 多来源：来源目录常驻左栏（方案 B），右栏 = 类型 Tab + 当前来源的结果；
    // 单来源退化为竖屏形态（目录没有可比较的对象）。手机 / 竖屏平板走下方 pager
    const activeKey = routes[index]?.key;
    const activeSource = sourceByPlatform.get(activeKey ?? '');
    if (layoutClass === 'tabletLandscape' && routes.length > 1) {
        return (
            <View style={styles.wide}>
                <SourceDirectory
                    sources={sources}
                    activePlatform={activeSource?.platform}
                    onSelect={setActiveSourcePlatform}
                />
                <View style={styles.wideResults}>
                    <Tabs items={typeTabs} value={type} onChange={setType} />
                    {activeKey === undefined ? (
                        noSource
                    ) : (
                        // key=type：换类型时各源 scene 全新（与 pager 同一规则）；同类型内来源 scene 惰性挂载、常驻保活
                        <KeepAliveScenes
                            key={type}
                            routes={routes}
                            activeKey={activeKey}
                            renderScene={platform => {
                                const plugin = sourceByPlatform.get(platform);
                                return plugin ? (
                                    <SearchResults
                                        source={plugin}
                                        type={type}
                                        query={query}
                                    />
                                ) : null;
                            }}
                        />
                    )}
                </View>
            </View>
        );
    }

    return (
        <>
            <Tabs items={typeTabs} value={type} onChange={setType} />
            {routes.length === 0 ? (
                noSource
            ) : (
                <TabView
                    key={type}
                    style={styles.fill}
                    navigationState={{ index, routes }}
                    renderScene={renderScene}
                    renderTabBar={renderTabBar}
                    onIndexChange={handleIndexChange}
                    lazy
                    initialLayout={{ width }}
                />
            )}
        </>
    );
}

/**
 * 横屏右栏的来源 scene 容器：与 TabView 的 lazy + 保活等价——首次选中才挂载，之后常驻，
 * 换来源只切可见层。各源的滚动位、翻页态互不干扰（设计稿要求来源间对照时状态各自保留）。
 * 隐藏层不可点、对读屏不可达
 */
function KeepAliveScenes({
    routes,
    activeKey,
    renderScene,
}: {
    routes: readonly SourceRoute[];
    activeKey: string;
    renderScene: (key: string) => ReactNode;
}) {
    const [visited, setVisited] = useState<ReadonlySet<string>>(
        () => new Set([activeKey]),
    );
    useEffect(() => {
        setVisited(prev =>
            prev.has(activeKey) ? prev : new Set(prev).add(activeKey),
        );
    }, [activeKey]);
    return (
        <View style={styles.fill}>
            {routes
                .filter(route => visited.has(route.key))
                .map(route => {
                    const active = route.key === activeKey;
                    return (
                        <View
                            key={route.key}
                            style={[
                                styles.scene,
                                active ? styles.sceneShown : styles.sceneHidden,
                            ]}
                            pointerEvents={active ? 'auto' : 'none'}
                            accessibilityElementsHidden={!active}
                            importantForAccessibility={
                                active ? 'auto' : 'no-hide-descendants'
                            }
                        >
                            {renderScene(route.key)}
                        </View>
                    );
                })}
        </View>
    );
}

const styles = StyleSheet.create({
    scene: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    sceneShown: { opacity: 1, zIndex: 1 },
    sceneHidden: { opacity: 0, zIndex: 0 },
    wide: {
        flex: 1,
        flexDirection: 'row',
    },
    wideResults: {
        flex: 1,
        minWidth: 0,
    },
    fill: {
        flex: 1,
    },
});
