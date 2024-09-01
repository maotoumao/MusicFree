import React, {useCallback, useState} from 'react';
import {StyleSheet, Text} from 'react-native';
import rpx from '@/utils/rpx';
import PluginManager from '@/core/pluginManager';
import {TabBar, TabView} from 'react-native-tab-view';
import {fontWeightConst} from '@/constants/uiConst';
import BoardPanelWrapper from './boardPanelWrapper';
import useColors from '@/hooks/useColors';
import NoPlugin from '@/components/base/noPlugin';

export default function TopListBody() {
    const routes = PluginManager.getSortedTopListsablePlugins().map(_ => ({
        key: _.hash,
        title: _.name,
    }));
    const [index, setIndex] = useState(0);
    const colors = useColors();

    const renderScene = useCallback(
        (props: {route: {key: string}}) => (
            <BoardPanelWrapper hash={props?.route?.key} />
        ),
        [],
    );
    if (!routes?.length) {
        return <NoPlugin notSupportType="榜单" />;
    }

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
                    style={styles.tabBarStyle}
                    tabStyle={styles.tabStyle}
                    scrollEnabled
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
            initialLayout={{width: rpx(750)}}
        />
    );
}

const styles = StyleSheet.create({
    tabBarStyle: {
        backgroundColor: 'transparent',
        shadowColor: 'transparent',
        borderColor: 'transparent',
    },
    tabStyle: {
        width: 'auto',
    },
});
