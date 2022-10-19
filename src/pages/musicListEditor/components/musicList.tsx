import React, {memo} from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import Empty from '@/components/base/empty';
import MusicItem from '@/components/mediaItem/musicItem';
import produce from 'immer';
import {useAtom, useSetAtom} from 'jotai';
import {Checkbox} from 'react-native-paper';
import {
    editingMusicListAtom,
    musicListChangedAtom,
    selectedIndicesAtom,
} from '../store/atom';
import DraggableFlatList from 'react-native-draggable-flatlist';

const ITEM_HEIGHT = rpx(120);

interface IMusicEditorItemProps {
    index: number;
    checked: boolean;
    musicItem: IMusic.IMusicItem;
    isActive: boolean;
    drag: () => void;
}
function _MusicEditorItem(props: IMusicEditorItemProps) {
    const setSelectedIndices = useSetAtom(selectedIndicesAtom);
    const {index, checked, musicItem, isActive, drag} = props;
    return (
        <MusicItem
            musicItem={musicItem}
            onItemLongPress={drag}
            itemBackgroundColor={isActive ? '#99999933' : undefined}
            left={{
                component: () => (
                    <View style={style.checkBox}>
                        <Checkbox
                            onPress={() => {
                                setSelectedIndices(
                                    produce(draft => {
                                        draft[index] = !draft[index];
                                    }),
                                );
                            }}
                            status={checked ? 'checked' : 'unchecked'}
                        />
                    </View>
                ),
            }}
            onItemPress={() => {
                setSelectedIndices(
                    produce(draft => {
                        draft[index] = !draft[index];
                    }),
                );
            }}
            // musicSheet={musicSheet}
        />
    );
}

const MusicEditorItem = memo(
    _MusicEditorItem,
    (prev, curr) =>
        prev.checked === curr.checked &&
        prev.index === curr.index &&
        prev.musicItem === curr.musicItem &&
        prev.isActive === curr.isActive,
);

/** 音乐列表 */
export default function MusicList() {
    const [editingMusicList, setEditingMusicList] =
        useAtom(editingMusicListAtom);
    const [selectedIndices, setSelectedIndices] = useAtom(selectedIndicesAtom);
    const setMusicListChanged = useSetAtom(musicListChangedAtom);

    return (
        <DraggableFlatList
            ListEmptyComponent={Empty}
            keyExtractor={musicItem =>
                `ml-${musicItem.id}${musicItem.platform}`
            }
            getItemLayout={(_, index) => ({
                length: ITEM_HEIGHT,
                offset: ITEM_HEIGHT * index,
                index,
            })}
            extraData={{selectedIndices}}
            containerStyle={style.wrapper}
            data={editingMusicList}
            onDragEnd={data => {
                setEditingMusicList(data.data);
                const {from, to} = data;
                if (from !== to) {
                    setMusicListChanged(true);
                }
                setSelectedIndices(prev => {
                    const newIndices = [
                        ...prev.slice(0, from),
                        ...prev.slice(from + 1),
                    ];
                    newIndices.splice(to, 0, prev[from]);
                    return newIndices;
                });
            }}
            renderItem={({index, item: musicItem, isActive, drag}) => {
                return (
                    <MusicEditorItem
                        musicItem={musicItem}
                        checked={selectedIndices[index!]}
                        index={index!}
                        isActive={isActive}
                        drag={drag}
                    />
                );
            }}
        />
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
