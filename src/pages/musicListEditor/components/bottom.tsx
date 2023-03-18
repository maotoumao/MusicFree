import React, {useMemo} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import ThemeText from '@/components/base/themeText';
import {iconSizeConst} from '@/constants/uiConst';
import useColors from '@/hooks/useColors';
import {useAtom, useSetAtom} from 'jotai';
import {editingMusicListAtom, musicListChangedAtom} from '../store/atom';
import MusicQueue from '@/core/musicQueue';
import Toast from '@/utils/toast';
import Download from '@/core/download';
import usePanel from '@/components/panels/usePanel';
import produce from 'immer';
import {useParams} from '@/entry/router';

export default function Bottom() {
    const {musicSheet} = useParams<'music-list-editor'>();
    const [editingMusicList, setEditingMusicList] =
        useAtom(editingMusicListAtom);
    const setMusicListChanged = useSetAtom(musicListChangedAtom);

    const selectedEditorItems = useMemo(
        () => editingMusicList.filter(_ => _.checked),
        [editingMusicList],
    );

    const selectedItems = useMemo(
        () => selectedEditorItems.map(_ => _.musicItem),
        [selectedEditorItems],
    );

    function resetSelectedIndices() {
        setEditingMusicList(
            editingMusicList.map(_ => ({
                musicItem: _.musicItem,
                checked: false,
            })),
        );
    }

    const {showPanel} = usePanel();
    return (
        <View style={style.wrapper}>
            <BottomIcon
                icon="motion-play-outline"
                title="下一首播放"
                onPress={async () => {
                    MusicQueue.addNext(selectedItems);
                    resetSelectedIndices();
                    Toast.success('已添加到下一首播放');
                }}
            />
            <BottomIcon
                icon="music-note-plus"
                title="加入歌单"
                onPress={() => {
                    if (selectedItems.length) {
                        showPanel('AddToMusicSheet', {
                            musicItem: selectedItems,
                        });
                        resetSelectedIndices();
                    }
                }}
            />
            <BottomIcon
                icon="arrow-down-bold-circle-outline"
                title="下载"
                onPress={() => {
                    if (selectedItems.length) {
                        Download.downloadMusic(selectedItems);
                        Toast.success(
                            '开始下载；全部下载完成之前请不要关闭应用',
                        );
                        resetSelectedIndices();
                    }
                }}
            />
            <BottomIcon
                icon="trash-can-outline"
                title="删除"
                color={
                    selectedItems.length && musicSheet?.id
                        ? 'text'
                        : 'textSecondary'
                }
                onPress={() => {
                    if (selectedItems.length && musicSheet?.id) {
                        setEditingMusicList(
                            produce(prev => prev.filter(_ => !_.checked)),
                        );
                        setMusicListChanged(true);
                        Toast.warn('记得保存哦');
                    }
                }}
            />
        </View>
    );
}

interface IBottomIconProps {
    icon: string;
    title: string;
    color?: 'text' | 'textSecondary';
    onPress: () => void;
}
function BottomIcon(props: IBottomIconProps) {
    const {icon, title, onPress, color = 'text'} = props;
    const colors = useColors();
    return (
        <Pressable
            onPress={onPress}
            style={[
                style.bottomIconWrapper,
                {backgroundColor: colors.primary},
            ]}>
            <Icon
                name={icon}
                color={colors[color]}
                size={iconSizeConst.big}
                onPress={onPress}
            />
            <ThemeText
                fontSize="subTitle"
                fontColor={color === 'text' ? 'normal' : 'secondary'}
                style={style.bottomIconText}>
                {title}
            </ThemeText>
        </Pressable>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: '100%',
        height: rpx(144),
        flexDirection: 'row',
    },

    bottomIconWrapper: {
        flex: 1,
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    bottomIconText: {
        marginTop: rpx(12),
    },
});
