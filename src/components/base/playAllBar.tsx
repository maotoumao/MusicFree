import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import {iconSizeConst} from '@/constants/uiConst';
import MusicQueue from '@/core/musicQueue';
import {ROUTE_PATH, useNavigate} from '@/entry/router';
import Color from 'color';
import {IconButton} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import ThemeText from './themeText';
import useColors from '@/hooks/useColors';
import usePanel from '../panels/usePanel';

interface IProps {
    musicList: IMusic.IMusicItem[] | null;
    sheetName?: string;
}
export default function (props: IProps) {
    const {musicList, sheetName} = props;
    const colors = useColors();
    const navigate = useNavigate();
    const {showPanel} = usePanel();

    return (
        <View
            style={[
                style.topWrapper,
                {
                    backgroundColor: Color(colors.primary)
                        .alpha(0.15)
                        .toString(),
                },
            ]}>
            <Pressable
                style={style.playAll}
                onPress={() => {
                    if (musicList) {
                        MusicQueue.playWithReplaceQueue(
                            musicList[0],
                            musicList,
                        );
                    }
                }}>
                <Icon
                    name="play-circle-outline"
                    style={style.playAllIcon}
                    size={iconSizeConst.normal}
                    color={colors.text}
                />
                <ThemeText fontWeight="bold">播放全部</ThemeText>
            </Pressable>
            <IconButton
                icon={'plus-box-multiple-outline'}
                size={rpx(48)}
                onPress={async () => {
                    showPanel('AddToMusicSheet', {
                        musicItem: musicList ?? [],
                        newSheetDefaultName: sheetName,
                    });
                }}
            />
            <IconButton
                icon="playlist-edit"
                size={rpx(48)}
                onPress={async () => {
                    navigate(ROUTE_PATH.MUSIC_LIST_EDITOR, {
                        musicList: musicList,
                        musicSheet: {
                            title: sheetName,
                        },
                    });
                }}
            />
        </View>
    );
}

const style = StyleSheet.create({
    /** playall */
    topWrapper: {
        height: rpx(72),
        paddingHorizontal: rpx(24),
        flexDirection: 'row',
        alignItems: 'center',
    },
    playAll: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    playAllIcon: {
        marginRight: rpx(12),
    },
});
