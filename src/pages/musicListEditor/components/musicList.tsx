import React, {memo, useCallback} from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import Empty from '@/components/base/empty';
import MusicItem from '@/components/mediaItem/musicItem';
import produce from 'immer';
import {useAtom, useSetAtom} from 'jotai';
import {Checkbox} from 'react-native-paper';
import {
    editingMusicListAtom,
    IEditorMusicItem,
    musicListChangedAtom,
} from '../store/atom';
import DraggableFlatList, {RenderItem} from 'react-native-draggable-flatlist';
import {useParams} from '@/entry/router';

const ITEM_HEIGHT = rpx(120);

interface IMusicEditorItemProps {
    index: number;
    editorMusicItem: IEditorMusicItem;
    isActive: boolean;
    drag?: () => void;
}
function _MusicEditorItem(props: IMusicEditorItemProps) {
    const {index, editorMusicItem, isActive, drag} = props;
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
            onItemLongPress={drag}
            itemBackgroundColor={isActive ? '#99999933' : undefined}
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
        prev.index === curr.index &&
        prev.isActive === curr.isActive,
);

/** 音乐列表 */

export default function MusicList() {
    const {musicSheet} = useParams<'music-list-editor'>();
    const [editingMusicList, setEditingMusicList] =
        useAtom(editingMusicListAtom);
    const setMusicListChanged = useSetAtom(musicListChangedAtom);

    const renderItem: RenderItem<IEditorMusicItem> = useCallback(
        ({index, item, isActive, drag}) => {
            return (
                <MusicEditorItem
                    editorMusicItem={item}
                    // checked={selectedIndices[index!]}
                    index={index!}
                    isActive={musicSheet?.id ? isActive : false}
                    drag={musicSheet?.id ? drag : undefined}
                />
            );
        },
        [editingMusicList],
    );

    return editingMusicList?.length ? (
        <DraggableFlatList
            ListEmptyComponent={Empty}
            keyExtractor={item =>
                `ml-${item.musicItem.id}${item.musicItem.platform}`
            }
            getItemLayout={(_, index) => ({
                length: ITEM_HEIGHT,
                offset: ITEM_HEIGHT * index,
                index,
            })}
            containerStyle={style.wrapper}
            data={editingMusicList}
            onDragEnd={data => {
                setEditingMusicList(data.data);
                requestAnimationFrame(() => {
                    const {from, to} = data;
                    if (from !== to) {
                        setMusicListChanged(true);
                    }
                });
            }}
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
