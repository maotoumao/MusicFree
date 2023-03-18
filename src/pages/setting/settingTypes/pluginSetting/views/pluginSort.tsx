import {View, TouchableOpacity, StyleSheet, StatusBar} from 'react-native';
import React, {useState} from 'react';
import SortableFlatList from '@/components/base/SortableFlatList';
import ThemeText from '@/components/base/themeText';
import {PluginMeta} from '@/core/pluginMeta';
import produce from 'immer';
import objectPath from 'object-path';
import rpx from '@/utils/rpx';
import PluginManager, {Plugin} from '@/core/pluginManager';
import SimpleAppBar from '@/components/base/simpleAppBar';
import Toast from '@/utils/toast';
import HorizonalSafeAreaView from '@/components/base/horizonalSafeAreaView';
import globalStyle from '@/constants/globalStyle';

const ITEM_HEIGHT = rpx(96);
const marginTop = rpx(188) + (StatusBar.currentHeight ?? 0);

export default function PluginSort() {
    const plugins = PluginManager.useSortedPlugins();
    const [sortingPlugins, setSortingPlugins] = useState([...plugins]);

    function renderSortingItem({item}: {item: Plugin}) {
        return (
            <View style={style.sortItem}>
                <ThemeText>{item.name}</ThemeText>
            </View>
        );
    }
    return (
        <>
            <SimpleAppBar title="插件排序" />
            <HorizonalSafeAreaView style={style.sortWrapper}>
                <>
                    <ThemeText fontWeight="bold">插件排序</ThemeText>
                    <TouchableOpacity
                        onPress={async () => {
                            await PluginMeta.setPluginMetaAll(
                                produce(
                                    PluginMeta.getPluginMetaAll(),
                                    draft => {
                                        sortingPlugins.forEach((plg, idx) => {
                                            objectPath.set(
                                                draft,
                                                `${plg.name}.order`,
                                                idx,
                                            );
                                        });
                                    },
                                ),
                            );
                            Toast.success('已保存');
                        }}>
                        <ThemeText>完成</ThemeText>
                    </TouchableOpacity>
                </>
            </HorizonalSafeAreaView>
            <HorizonalSafeAreaView style={globalStyle.flex1}>
                <SortableFlatList
                    data={sortingPlugins}
                    activeBackgroundColor="rgba(33,33,33,0.8)"
                    marginTop={marginTop}
                    renderItem={renderSortingItem}
                    itemHeight={ITEM_HEIGHT}
                    itemJustifyContent={'space-between'}
                    onSortEnd={data => {
                        setSortingPlugins(data);
                    }}
                />
            </HorizonalSafeAreaView>
        </>
    );
}

const style = StyleSheet.create({
    sortWrapper: {
        marginHorizontal: rpx(24),
        marginTop: rpx(36),
        justifyContent: 'space-between',
        height: rpx(64),
        alignItems: 'center',
        flexDirection: 'row',
    },
    sortItem: {
        height: ITEM_HEIGHT,
        width: rpx(500),
        paddingLeft: rpx(24),
        justifyContent: 'center',
    },
});
