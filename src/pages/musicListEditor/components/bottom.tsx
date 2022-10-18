import React, {useMemo} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import ThemeText from '@/components/base/themeText';
import {iconSizeConst} from '@/constants/uiConst';
import useColors from '@/hooks/useColors';
import {useAtom} from 'jotai';
import {editingMusicListAtom, selectedIndicesAtom} from '../store/atom';
import MusicQueue from '@/core/musicQueue';
import Toast from '@/utils/toast';
import Download from '@/core/download';
import usePanel from '@/components/panels/usePanel';

export default function Bottom() {
    const [editingMusicList, setEditingMusicList] =
        useAtom(editingMusicListAtom);
    const [selectedIndices, setSelectedIndices] = useAtom(selectedIndicesAtom);

    const selectedItems = useMemo(
        () => () =>
            editingMusicList.filter((_, index) => selectedIndices[index]),
        [editingMusicList, selectedIndices],
    );

    const {showPanel} = usePanel();
    return (
        <View style={style.wrapper}>
            <BottomIcon
                icon="motion-play-outline"
                title="下一首播放"
                onPress={async () => {
                    MusicQueue.addNext(selectedItems());
                    setSelectedIndices([]);
                    Toast.success('已添加到下一首播放');
                }}
            />
            <BottomIcon
                icon="music-note-plus"
                title="加入歌单"
                onPress={() => {
                    if (selectedItems().length) {
                        showPanel('AddToMusicSheet', {
                            musicItem: selectedItems(),
                        });
                        setSelectedIndices([]);
                    }
                }}
            />
            <BottomIcon
                icon="arrow-down-bold-circle-outline"
                title="下载"
                onPress={() => {
                    if (selectedItems().length) {
                        Download.downloadMusic(selectedItems());
                        Toast.success('开始下载');
                        setSelectedIndices([]);
                    }
                }}
            />
            <BottomIcon
                icon="trash-can-outline"
                title="删除"
                onPress={() => {
                    if (selectedItems().length) {
                        setEditingMusicList(prev =>
                            prev.filter((_, index) => !selectedIndices[index]),
                        );
                        setSelectedIndices([]);
                        Toast.success('记得保存哦');
                    }
                }}
            />
        </View>
    );
}

interface IBottomIconProps {
    icon: string;
    title: string;
    onPress: () => void;
}
function BottomIcon(props: IBottomIconProps) {
    const {icon, title, onPress} = props;
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
                color={colors.text}
                size={iconSizeConst.big}
                onPress={onPress}
            />
            <ThemeText fontSize="subTitle" style={style.bottomIconText}>
                {title}
            </ThemeText>
        </Pressable>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
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
