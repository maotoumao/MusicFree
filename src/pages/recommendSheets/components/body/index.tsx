import React, {useState} from 'react';
import {Text} from 'react-native';
import rpx, {vw} from '@/utils/rpx';
import {TabBar, TabView} from 'react-native-tab-view';
import PluginManager from '@/core/pluginManager';
import {fontWeightConst} from '@/constants/uiConst';
import SheetBody from './sheetBody';
import useColors from '@/hooks/useColors';
import Empty from '@/components/base/empty';

export default function Body() {
    const [index, setIndex] = useState(0);
    const colors = useColors();
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
                width: 'auto',
            }}
            pressColor="transparent"
            inactiveColor={colors.text}
            activeColor={colors.primary}
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
                    {route.title ?? '(未命名)'}
                </Text>
            )}
            indicatorStyle={{
                backgroundColor: colors.primary,
                height: rpx(4),
            }}
        />
    );

    if (!routes?.length) {
        return <Empty />;
    }
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
