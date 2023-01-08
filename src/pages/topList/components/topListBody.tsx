import React, {useCallback, useState} from 'react';
import {Text} from 'react-native';
import rpx from '@/utils/rpx';
import PluginManager from '@/core/pluginManager';
import {TabBar, TabView} from 'react-native-tab-view';
import {fontWeightConst} from '@/constants/uiConst';
import Color from 'color';
import {useTheme} from 'react-native-paper';
import BoardPanelWrapper from './boardPanelWrapper';

export default function TopListBody() {
    const routes = PluginManager.getSortedTopListsablePlugins().map(_ => ({
        key: _.hash,
        title: _.name,
    }));
    const [index, setIndex] = useState(0);
    const {colors} = useTheme();

    const renderScene = useCallback(
        (props: {route: {key: string}}) => (
            <BoardPanelWrapper hash={props?.route?.key} />
        ),
        [],
    );

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
                    scrollEnabled
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
            initialLayout={{width: rpx(750)}}
        />
    );
}
