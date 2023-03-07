/**
 * 搜索结果面板 一级页
 */
import React, {memo, useState} from 'react';
import {Text} from 'react-native';
import rpx, {vw} from '@/utils/rpx';
import {SceneMap, TabBar, TabView} from 'react-native-tab-view';
import ResultSubPanel from './resultSubPanel';
import results from './results';
import {fontWeightConst} from '@/constants/uiConst';
import {useTheme} from 'react-native-paper';
import Color from 'color';

const routes = results;

const getRouterScene = (
    routes: Array<{key: ICommon.SupportMediaType; title: string}>,
) => {
    const scene: Record<string, () => JSX.Element> = {};
    routes.forEach(r => {
        scene[r.key] = () => <ResultSubPanel tab={r.key} />;
    });
    return SceneMap(scene);
};

const renderScene = getRouterScene(routes);

function ResultPanel() {
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
                        backgroundColor: Color(colors.primary)
                            .alpha(0.7)
                            .toString(),
                        shadowColor: 'transparent',
                        borderColor: 'transparent',
                    }}
                    tabStyle={{
                        width: rpx(200),
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
                    }}
                />
            )}
            style={{
                backgroundColor: colors.background,
            }}
            renderScene={renderScene}
            onIndexChange={setIndex}
            initialLayout={{width: vw(100)}}
        />
    );
}

export default memo(ResultPanel);
