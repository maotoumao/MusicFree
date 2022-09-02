/**
 * 搜索结果面板 一级页
 */
import React, {memo, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import {SceneMap, TabBar, TabView} from 'react-native-tab-view';
import ResultSubPanel from './resultSubPanel';
import results from './results';
import {fontWeightConst} from '@/constants/uiConst';
import {useTheme} from 'react-native-paper';
import Color from 'color';

interface IResultPanelProps {}

const routes = results;

const getRouterScene = (
  routes: Array<{key: ICommon.SupportMediaType; title: string}>,
) => {
  const scene: Record<string, () => JSX.Element> = {};
  routes.forEach(r => {
    scene[r.key] = () => <ResultSubPanel tab={r.key}></ResultSubPanel>;
  });
  return SceneMap(scene);
};

const renderScene = getRouterScene(routes);

function ResultPanel(props: IResultPanelProps) {
  const [index, setIndex] = useState(0);
  const {colors} = useTheme();

  return (
    <TabView
      lazy
      navigationState={{
        index,
        routes,
      }}
      renderTabBar={props => (
        <TabBar
          {...props}
          style={{
            backgroundColor: Color(colors.primary).alpha(0.7).toString(),
            shadowColor: 'transparent',
            borderColor: 'transparent',
          }}
          tabStyle={{
            width: rpx(128),
          }}
          renderLabel={({route, focused, color}) => (
            <Text
              style={{
                fontWeight: focused
                  ? fontWeightConst.bolder
                  : fontWeightConst.bold,
                color,
              }}>
              {route.title}
            </Text>
          )}
          indicatorStyle={{
            backgroundColor: colors.text,
            height: rpx(4),
          }}></TabBar>
      )}
      style={{
        backgroundColor: colors.background,
      }}
      renderScene={renderScene}
      onIndexChange={setIndex}
      initialLayout={{width: rpx(750)}}></TabView>
  );
}

export default memo(ResultPanel);
