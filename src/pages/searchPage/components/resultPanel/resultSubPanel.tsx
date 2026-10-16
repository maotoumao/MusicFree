import Empty from "@/components/base/empty";
import { fontWeightConst } from "@/constants/uiConst";
import { useI18N } from "@/core/i18n";
import PluginManager from "@/core/pluginManager";
import useColors from "@/hooks/useColors";
import rpx, { vw } from "@/utils/rpx";
import { useAtomValue } from "jotai";
import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import ThemeText from "@/components/base/themeText";
import { expandAggregateMusic } from "../../store/aggregateMusic";
import { SceneMap, TabBar, TabView } from "react-native-tab-view";
import {
    ALL_SOURCES_HASH,
    aggregateSearchResultsAtom,
    searchResultsAtom,
} from "../../store/atoms";
import { renderMap } from "./results";
import DefaultResults from "./results/defaultResults";
import ResultWrapper from "./resultWrapper";

function AggregateResultScene() {
    const { t } = useI18N();
    const results = useAtomValue(aggregateSearchResultsAtom);
    const result = results.music;
    const resultRef = useRef(result);
    useEffect(() => {
        resultRef.current = result;
    }, [result]);

    return (
        <View style={styles.aggregateScene}>
            <Pressable accessibilityRole="button" onPress={expandAggregateMusic} disabled={result?.expanded} style={styles.expandButton}>
                <ThemeText>{result?.expanded ? t("searchPage.backupIncluded") : t("searchPage.expandSources")}</ThemeText>
            </Pressable>
            <ResultWrapper
                tab="music"
                searchResult={result}
                pluginHash={ALL_SOURCES_HASH}
                pluginName="All Sources"
                pluginSearchResultRef={resultRef}
                aggregate
            />
        </View>
    );
}

interface IResultSubPanelProps {
    tab: ICommon.SupportMediaType;
}

// 展示结果的视图
function getResultComponent(
    tab: ICommon.SupportMediaType,
    pluginHash: string,
    pluginName: string,
) {
    return tab in renderMap
        ? memo(
            () => {
                const searchResults = useAtomValue(searchResultsAtom);
                const pluginSearchResult = searchResults[tab][pluginHash];
                const pluginSearchResultRef = useRef(pluginSearchResult);

                useEffect(() => {
                    pluginSearchResultRef.current = pluginSearchResult;
                }, [pluginSearchResult]);

                return (
                    <ResultWrapper
                        tab={tab}
                        searchResult={pluginSearchResult}
                        pluginHash={pluginHash}
                        pluginName={pluginName}
                        pluginSearchResultRef={pluginSearchResultRef}
                    />
                );
            },
            () => true,
        )
        : () => <DefaultResults />;
}

/** 结果scene */
function getSubRouterScene(
    tab: ICommon.SupportMediaType,
    routes: Array<{ key: string; title: string }>,
) {
    const scene: Record<string, React.FC> = {};
    routes.forEach(r => {
        scene[r.key] = r.key === ALL_SOURCES_HASH
            ? () => <AggregateResultScene />
            : getResultComponent(tab, r.key, r.title);
    });
    return SceneMap(scene);
}

function ResultSubPanel(props: IResultSubPanelProps) {
    const [index, setIndex] = useState(0);
    const colors = useColors();
    const { t } = useI18N();

    const pluginRoutes = PluginManager.getSortedSearchablePlugins(props.tab).map(
        _ => ({
            key: _.hash,
            title: _.name,
        }),
    );
    const routes = props.tab === "music" && pluginRoutes.length
        ? [{ key: ALL_SOURCES_HASH, title: t("searchPage.allSources") }, ...pluginRoutes]
        : pluginRoutes;
    // Keep scene component identities stable until the actual routes change.
    const routesKey = JSON.stringify(routes);
    const renderScene = useMemo(
        () => getSubRouterScene(props.tab, JSON.parse(routesKey)),
        [props.tab, routesKey],
    );

    if (!routes.length) {
        return <Empty />;
    }

    return (
        <TabView
            lazy
            navigationState={{
                index,
                routes,
            }}
            renderTabBar={_ => (
                <TabBar
                    {..._}
                    scrollEnabled
                    style={styles.tabBar}
                    inactiveColor={colors.text}
                    activeColor={colors.primary}
                    tabStyle={styles.tab}
                    renderIndicator={() => null}
                    pressColor="transparent"
                    renderLabel={({ route, focused, color }) => (
                        <Text
                            numberOfLines={1}
                            style={[styles.label, {
                                fontWeight: focused
                                    ? fontWeightConst.bolder
                                    : fontWeightConst.medium,
                                color,
                            }]}>
                            {route.title ?? `(${t("common.unknownName")})`}
                        </Text>
                    )}
                />
            )}
            renderScene={renderScene}
            onIndexChange={setIndex}
            initialLayout={{ width: vw(100) }}
        />
    );
}

// 不然会一直重新渲染
export default memo(ResultSubPanel);

const styles = StyleSheet.create({
    aggregateScene: { flex: 1 },
    expandButton: { padding: 12 },
    tabBar: {
        backgroundColor: "transparent",
        shadowColor: "transparent",
        borderColor: "transparent",
    },
    tab: { width: "auto" },
    label: { width: rpx(140), textAlign: "center" },
});
