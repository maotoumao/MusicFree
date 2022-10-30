import React, {memo, useCallback} from 'react';
import {ListRenderItem, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import Empty from '@/components/base/empty';
import MusicItem from '@/components/mediaItem/musicItem';
import produce from 'immer';
import {useAtomValue, useSetAtom} from 'jotai';
import {Checkbox} from 'react-native-paper';
import {editingMusicListAtom, IEditorMusicItem} from '../store/atom';
import {FlatList} from 'react-native-gesture-handler';

const ITEM_HEIGHT = rpx(120);

interface IMusicEditorItemProps {
    index: number;
    editorMusicItem: IEditorMusicItem;
}
function _MusicEditorItem(props: IMusicEditorItemProps) {
    const {index, editorMusicItem} = props;
    const setEditingMusicList = useSetAtom(editingMusicListAtom);

    const onPress = useCallback(() => {
        setEditingMusicList(
            produce(draft => {
                draft[index].checked = !draft[index].checked;
            }),
        );
    }, [index]);
    return (
        <MusicItem
            musicItem={editorMusicItem.musicItem}
            left={{
                component: () => (
                    <View style={style.checkBox}>
                        <Checkbox
                            onPress={onPress}
                            status={
                                editorMusicItem.checked
                                    ? 'checked'
                                    : 'unchecked'
                            }
                        />
                    </View>
                ),
            }}
            onItemPress={onPress}
            // musicSheet={musicSheet}
        />
    );
}

const MusicEditorItem = memo(
    _MusicEditorItem,
    (prev, curr) =>
        prev.editorMusicItem === curr.editorMusicItem &&
        prev.index === curr.index,
);

/** 音乐列表 */

export default function MusicList() {
    const editingMusicList = useAtomValue(editingMusicListAtom);

    const renderItem: ListRenderItem<IEditorMusicItem> = useCallback(
        ({index, item}) => {
            return (
                <MusicEditorItem
                    editorMusicItem={item}
                    // checked={selectedIndices[index!]}
                    index={index!}
                />
            );
        },
        [editingMusicList],
    );

    return editingMusicList?.length ? (
        <FlatList
            ListEmptyComponent={Empty}
            keyExtractor={item =>
                `ml-${item.musicItem.id}${item.musicItem.platform}`
            }
            getItemLayout={(_, index) => ({
                length: ITEM_HEIGHT,
                offset: ITEM_HEIGHT * index,
                index,
            })}
            style={style.wrapper}
            data={editingMusicList}
            renderItem={renderItem}
        />
    ) : (
        <View style={style.wrapper} />
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        flex: 1,
    },
    checkBox: {
        height: '100%',
        justifyContent: 'center',
    },
});
