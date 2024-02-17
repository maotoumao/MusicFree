import React, {memo, useEffect, useMemo, useRef, useState} from 'react';
import {Text} from 'react-native';
import rpx, {vw} from '@/utils/rpx';
import {SceneMap, TabBar, TabView} from 'react-native-tab-view';
import DefaultResults from './results/defaultResults';
import {renderMap} from './results';
import ResultWrapper from './resultWrapper';
import {fontWeightConst} from '@/constants/uiConst';
import {useAtomValue} from 'jotai';
import {searchResultsAtom} from '../../store/atoms';
import PluginManager from '@/core/pluginManager';
import useColors from '@/hooks/useColors';
import Empty from '@/components/base/empty';

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
    routes: Array<{key: string; title: string}>,
) {
    const scene: Record<string, React.FC> = {};
    routes.forEach(r => {
        // todo: 是否声明不可搜索
        scene[r.key] = getResultComponent(tab, r.key, r.title);
    });
    return SceneMap(scene);
}

function ResultSubPanel(props: IResultSubPanelProps) {
    const [index, setIndex] = useState(0);
    const colors = useColors();

    const routes = PluginManager.getSortedSearchablePlugins(props.tab).map(
        _ => ({
            key: _.hash,
            title: _.name,
        }),
    );
    const renderScene = useMemo(
        () => getSubRouterScene(props.tab, routes),
        [props.tab],
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
                    style={{
                        backgroundColor: 'transparent',
                        shadowColor: 'transparent',
                        borderColor: 'transparent',
                    }}
                    inactiveColor={colors.text}
                    activeColor={colors.primary}
                    tabStyle={{
                        width: 'auto',
                    }}
                    renderIndicator={() => null}
                    pressColor="transparent"
                    renderLabel={({route, focused, color}) => (
                        <Text
                            numberOfLines={1}
                            style={{
                                width: rpx(140),
                                fontWeight: focused
                                    ? fontWeightConst.bolder
                                    : fontWeightConst.medium,
                                color,
                                textAlign: 'center',
                            }}>
                            {route.title ?? '(未命名)'}
                        </Text>
                    )}
                />
            )}
            renderScene={renderScene}
            onIndexChange={setIndex}
            initialLayout={{width: vw(100)}}
        />
    );
}

// 不然会一直重新渲染
export default memo(ResultSubPanel);
