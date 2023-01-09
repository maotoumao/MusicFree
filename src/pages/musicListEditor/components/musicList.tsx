import React, {memo, useCallback} from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import MusicItem from '@/components/mediaItem/musicItem';
import produce from 'immer';
import {useAtom, useSetAtom} from 'jotai';
import {Checkbox} from 'react-native-paper';
import DraggableFlatList from 'react-native-draggable-flatlist';
import {
    editingMusicListAtom,
    IEditorMusicItem,
    musicListChangedAtom,
} from '../store/atom';
import {RenderItem} from 'react-native-draggable-flatlist/lib/typescript/types';

const ITEM_HEIGHT = rpx(120);

interface IMusicEditorItemProps {
    getIndex: () => number | undefined;
    editorMusicItem: IEditorMusicItem;
    drag: () => void;
    isActive: boolean;
}
function _MusicEditorItem(props: IMusicEditorItemProps) {
    const {getIndex, editorMusicItem, drag, isActive} = props;
    const setEditingMusicList = useSetAtom(editingMusicListAtom);
    const index = getIndex()!;
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
            itemBackgroundColor={isActive ? '#999999' : undefined}
            onItemLongPress={drag}
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
        />
    );
}

const MusicEditorItem = memo(
    _MusicEditorItem,
    (prev, curr) =>
        prev.editorMusicItem === curr.editorMusicItem &&
        prev.isActive === curr.isActive,
);

export default function MusicList() {
    const [editingMusicList, setEditingMusicList] =
        useAtom(editingMusicListAtom);
    const setMusicListChanged = useSetAtom(musicListChangedAtom);

    const renderItem: RenderItem<IEditorMusicItem> = useCallback(
        ({item, getIndex, drag, isActive}) => {
            return (
                <MusicEditorItem
                    editorMusicItem={item}
                    getIndex={getIndex}
                    drag={drag}
                    isActive={isActive}
                />
            );
        },
        [editingMusicList],
    );

    return editingMusicList?.length ? (
        <DraggableFlatList
            style={style.wrapper}
            keyExtractor={item => item.musicItem.id}
            getItemLayout={(_, index) => ({
                length: ITEM_HEIGHT,
                offset: ITEM_HEIGHT * index,
                index,
            })}
            onDragEnd={params => {
                setEditingMusicList([...params.data]);
                setMusicListChanged(true);
            }}
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
    iconRight: {
        textAlignVertical: 'center',
    },
});
