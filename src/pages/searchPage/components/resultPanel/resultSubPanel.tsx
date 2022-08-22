import React, {useEffect, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import {SceneMap, TabBar, TabView} from 'react-native-tab-view';
import {usePlugins} from '@/common/pluginManager';
import MusicResults from './results/musicResults';
import AlbumResults from './results/albumResults';
import DefaultResults from './results/defaultResults';
import {renderMap} from './results';
import ResultWrapper from './resultWrapper';
import { fontWeightConst } from '@/constants/uiConst';

interface IResultSubPanelProps {
  tab: ICommon.SupportMediaType;
}

function useSubtabRoutes() {
  const plugins = usePlugins();
  const [routes, setRoutes] = useState<Array<{key: string; title: string}>>([]);

  useEffect(() => {
    setRoutes(
      [
        {
          key: 'all',
          title: '全部',
        },
      ].concat(
        plugins.map(_ => ({
          key: _.hash,
          title: _.instance.platform,
        })),
      ),
    );
  }, [plugins]);
  return routes;
}

// 展示结果的视图
function getResultComponent(tab: ICommon.SupportMediaType, subTab: string) {
  return tab in renderMap
    ? () => {
        return <ResultWrapper tab={tab} platform={subTab}></ResultWrapper>;
      }
    : () => <DefaultResults></DefaultResults>;
}

/** 结果scene */
function getSubRouterScene(
  tab: ICommon.SupportMediaType,
  routes: Array<{key: string; title: string}>,
) {
  const scene: Record<string, () => JSX.Element> = {};
  routes.forEach(r => {
    scene[r.key] = getResultComponent(tab, r.key);
  });
  return SceneMap(scene);
}

export default function ResultSubPanel(props: IResultSubPanelProps) {
  const [index, setIndex] = useState(0);
  const routes = useSubtabRoutes();
  return (
    <TabView
      navigationState={{
        index,
        routes,
      }}
      renderTabBar={props => (
        <TabBar
          {...props}
          style={{
            backgroundColor: 'transparent',
            shadowColor: 'transparent',
            borderColor: 'transparent',
          }}
          tabStyle={{
            width: rpx(128),
          }}
          renderIndicator={() => null}
          pressColor="transparent"
          renderLabel={({route, focused, color}) => (
            <Text
              style={{
                fontWeight: focused ? fontWeightConst.bolder : fontWeightConst.bold,
                color,
              }}>
              {route.title ?? '(未命名)'}
            </Text>
          )}></TabBar>
      )}
      renderScene={getSubRouterScene(props.tab, routes)}
      onIndexChange={setIndex}
      initialLayout={{width: rpx(750)}}></TabView>
  );
}
