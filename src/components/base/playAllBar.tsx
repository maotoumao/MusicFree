import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import {iconSizeConst} from '@/constants/uiConst';
import MusicQueue from '@/core/musicQueue';
import {ROUTE_PATH, useNavigate} from '@/entry/router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import ThemeText from './themeText';
import useColors from '@/hooks/useColors';
import {showPanel} from '../panels/usePanel';
import IconButton from './iconButton';

interface IProps {
    musicList: IMusic.IMusicItem[] | null;
    sheetName?: string;
}
export default function (props: IProps) {
    const {musicList, sheetName} = props;
    const colors = useColors();
    const navigate = useNavigate();

    return (
        <View style={style.topWrapper}>
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
                name={'plus-box-multiple-outline'}
                sizeType={'normal'}
                style={style.optionButton}
                onPress={async () => {
                    showPanel('AddToMusicSheet', {
                        musicItem: musicList ?? [],
                        newSheetDefaultName: sheetName,
                    });
                }}
            />
            <IconButton
                name="playlist-edit"
                sizeType={'normal'}
                style={style.optionButton}
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
        height: rpx(84),
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
    optionButton: {
        marginLeft: rpx(36),
    },
});
