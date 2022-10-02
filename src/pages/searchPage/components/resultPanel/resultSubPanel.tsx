import React, {memo, useCallback, useState} from 'react';
import {Text} from 'react-native';
import rpx from '@/utils/rpx';
import {SceneMap, TabBar, TabView} from 'react-native-tab-view';
import DefaultResults from './results/defaultResults';
import {renderMap} from './results';
import ResultWrapper from './resultWrapper';
import {fontWeightConst} from '@/constants/uiConst';
import {useAtomValue} from 'jotai';
import {searchResultsAtom} from '../../store/atoms';
import PluginManager from '@/core/pluginManager';

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
                  return (
                      <ResultWrapper
                          tab={tab}
                          searchResult={pluginSearchResult}
                          pluginHash={pluginHash}
                          pluginName={pluginName}
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
        scene[r.key] = getResultComponent(tab, r.key, r.title);
    });
    return SceneMap(scene);
}

function ResultSubPanel(props: IResultSubPanelProps) {
    const [index, setIndex] = useState(0);
    // todo 是否聚合结果，如果是的话
    const routes = PluginManager.getValidPlugins().map(_ => ({
        key: _.hash,
        title: _.name,
    }));

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
                    tabStyle={{
                        width: rpx(200),
                    }}
                    renderIndicator={() => null}
                    pressColor="transparent"
                    renderLabel={({route, focused, color}) => (
                        <Text
                            numberOfLines={1}
                            style={{
                                fontWeight: focused
                                    ? fontWeightConst.bolder
                                    : fontWeightConst.bold,
                                color,
                            }}>
                            {route.title ?? '(未命名)'}
                        </Text>
                    )}
                />
            )}
            renderScene={useCallback(getSubRouterScene(props.tab, routes), [
                props.tab,
            ])}
            onIndexChange={setIndex}
            initialLayout={{width: rpx(750)}}
        />
    );
}

// 不然会一直重新渲染
export default memo(ResultSubPanel);
