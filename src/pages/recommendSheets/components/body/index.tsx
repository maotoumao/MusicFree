import React, {useState} from 'react';
import {Text} from 'react-native';
import rpx, {vw} from '@/utils/rpx';
import {TabBar, TabView} from 'react-native-tab-view';
import PluginManager from '@/core/pluginManager';
import {fontWeightConst} from '@/constants/uiConst';
import SheetBody from './sheetBody';

export default function Body() {
    const [index, setIndex] = useState(0);

    const routes = PluginManager.getSortedRecommendSheetablePlugins().map(
        _ => ({
            key: _.hash,
            title: _.name,
        }),
    );

    const renderTabBar = (_: any) => (
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
    );

    return (
        <TabView
            lazy
            navigationState={{
                index,
                routes,
            }}
            renderTabBar={renderTabBar}
            renderScene={props => {
                return <SheetBody hash={props.route.key} />;
            }}
            onIndexChange={setIndex}
            initialLayout={{width: vw(100)}}
            swipeEnabled={false}
        />
    );
}
