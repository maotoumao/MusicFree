import {StatusBar, StyleSheet, TouchableOpacity, View} from 'react-native';
import React, {useState} from 'react';
import SortableFlatList from '@/components/base/SortableFlatList';
import ThemeText from '@/components/base/themeText';
import {PluginMeta} from '@/core/pluginMeta';
import {produce} from 'immer';
import objectPath from 'object-path';
import rpx from '@/utils/rpx';
import PluginManager, {Plugin} from '@/core/pluginManager';
import Toast from '@/utils/toast';
import HorizontalSafeAreaView from '@/components/base/horizontalSafeAreaView.tsx';
import globalStyle from '@/constants/globalStyle';
import AppBar from '@/components/base/appBar';
import useColors from '@/hooks/useColors';

const ITEM_HEIGHT = rpx(96);
const marginTop = rpx(188) + (StatusBar.currentHeight ?? 0);

export default function PluginSort() {
    const plugins = PluginManager.useSortedPlugins();
    const [sortingPlugins, setSortingPlugins] = useState([...plugins]);

    const colors = useColors();

    function renderSortingItem({item}: {item: Plugin}) {
        return (
            <View style={style.sortItem}>
                <ThemeText>{item.name}</ThemeText>
            </View>
        );
    }
    return (
        <>
            <AppBar>插件排序</AppBar>
            <HorizontalSafeAreaView style={style.sortWrapper}>
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
            </HorizontalSafeAreaView>
            <HorizontalSafeAreaView style={globalStyle.flex1}>
                <SortableFlatList
                    data={sortingPlugins}
                    activeBackgroundColor={colors.placeholder}
                    marginTop={marginTop}
                    renderItem={renderSortingItem}
                    itemHeight={ITEM_HEIGHT}
                    itemJustifyContent={'space-between'}
                    onSortEnd={data => {
                        setSortingPlugins(data);
                    }}
                />
            </HorizontalSafeAreaView>
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
