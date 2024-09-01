import React, {useEffect, useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import rpx, {vmax, vw} from '@/utils/rpx';

import {fontSizeConst, fontWeightConst} from '@/constants/uiConst';
import Button from '@/components/base/textButton.tsx';
import useColors from '@/hooks/useColors';
import PanelBase from '../../base/panelBase';
import {TextInput} from 'react-native-gesture-handler';
import useSearchLrc from './useSearchLrc';
import PluginManager from '@/core/pluginManager';
import {SceneMap, TabBar, TabView} from 'react-native-tab-view';
import LyricList from './LyricList';
import globalStyle from '@/constants/globalStyle';
import NoPlugin from '@/components/base/noPlugin';

interface INewMusicSheetProps {
    musicItem?: IMusic.IMusicItem | null;
}

export default function SearchLrc(props: INewMusicSheetProps) {
    const {musicItem} = props;
    const [input, setInput] = useState(
        musicItem?.alias ?? musicItem?.title ?? '',
    );
    const colors = useColors();

    const searchLrc = useSearchLrc();

    useEffect(() => {
        if (musicItem) {
            searchLrc(musicItem.alias || musicItem.title, 1);
        }
    }, []);

    return (
        <PanelBase
            keyboardAvoidBehavior="none"
            awareKeyboard
            height={vmax(80)}
            renderBody={() => (
                <View style={style.wrapper}>
                    <View style={style.titleContainer}>
                        <TextInput
                            value={input}
                            onChangeText={_ => {
                                setInput(_);
                            }}
                            onSubmitEditing={() => {
                                searchLrc(input, 1);
                            }}
                            style={[
                                style.input,
                                {
                                    color: colors.text,
                                    backgroundColor: colors.placeholder,
                                },
                            ]}
                            placeholderTextColor={colors.textSecondary}
                            placeholder={'歌曲名称'}
                            maxLength={80}
                        />
                        <Button
                            style={style.searchBtn}
                            onPress={() => {
                                searchLrc(input, 1);
                            }}>
                            搜索
                        </Button>
                    </View>
                    <LyricResultBodyWrapper />
                </View>
            )}
        />
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        paddingTop: rpx(36),
        flex: 1,
    },
    titleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: rpx(6),
        paddingHorizontal: rpx(24),
    },

    opeartions: {
        width: rpx(750),
        paddingHorizontal: rpx(24),
        flexDirection: 'row',
        height: rpx(100),
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    input: {
        borderRadius: rpx(12),
        fontSize: fontSizeConst.content,
        lineHeight: fontSizeConst.content * 1.5,
        padding: rpx(12),
        flex: 1,
    },
    searchBtn: {
        marginLeft: rpx(12),
    },
});

function LyricResultBodyWrapper() {
    const [index, setIndex] = useState(0);

    const routes = PluginManager.getSortedSearchablePlugins('lyric')?.map?.(
        _ => ({
            key: _.hash,
            title: _.name,
        }),
    );

    const sceneMap = useRef(
        (() => {
            const scene: Record<string, any> = {};
            routes.forEach(r => {
                scene[r.key] = LyricList;
            });
            return SceneMap(scene);
        })(),
    );

    const colors = useColors();
    return routes?.length ? (
        <TabView
            style={globalStyle.fwflex1}
            lazy
            navigationState={{
                index,
                routes,
            }}
            renderTabBar={_ => (
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
            )}
            renderScene={sceneMap.current}
            onIndexChange={setIndex}
            initialLayout={{width: vw(100)}}
        />
    ) : (
        <NoPlugin notSupportType="搜索歌词" />
    );
}
