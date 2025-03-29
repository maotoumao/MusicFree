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
import useColors from '@/hooks/useColors';
import {useAtom} from "jotai";
import {typeAtom} from "@/pages/searchPage/store/atoms";

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
    const [scene] = useAtom(typeAtom);
    let sceneIndex = 0;
    if (scene) {
        sceneIndex = routes.findIndex(route => route.key === scene);
    }
    const [index, setIndex] = useState(sceneIndex);

    const colors = useColors();

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
                    scrollEnabled
                    style={{
                        backgroundColor: colors.tabBar,
                        shadowColor: 'transparent',
                        borderColor: 'transparent',
                    }}
                    inactiveColor={colors.text}
                    activeColor={colors.primary}
                    tabStyle={{
                        width: 'auto',
                    }}
                    renderLabel={({route, focused, color}) => (
                        <Text
                            numberOfLines={1}
                            style={{
                                width: rpx(160),
                                fontWeight: focused
                                    ? fontWeightConst.bolder
                                    : fontWeightConst.medium,
                                color,
                                textAlign: 'center',
                            }}>
                            {route.title}
                        </Text>
                    )}
                    indicatorStyle={{
                        backgroundColor: colors.primary,
                        height: rpx(4),
                    }}
                />
            )}
            renderScene={renderScene}
            onIndexChange={setIndex}
            initialLayout={{width: vw(100)}}
        />
    );
}

export default memo(ResultPanel);
