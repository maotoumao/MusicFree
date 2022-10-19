import React, {memo} from 'react';
import {FlatList, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import Empty from '@/components/base/empty';
import MusicItem from '@/components/mediaItem/musicItem';
import produce from 'immer';
import {useAtom, useAtomValue, useSetAtom} from 'jotai';
import {Checkbox} from 'react-native-paper';
import {editingMusicListAtom, selectedIndicesAtom} from '../store/atom';

const ITEM_HEIGHT = rpx(120);

interface IMusicEditorItemProps {
    index: number;
    checked: boolean;
    musicItem: IMusic.IMusicItem;
}
function _MusicEditorItem(props: IMusicEditorItemProps) {
    const setSelectedIndices = useSetAtom(selectedIndicesAtom);
    const {index, checked, musicItem} = props;

    return (
        <MusicItem
            musicItem={musicItem}
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
        prev.musicItem === curr.musicItem,
);

/** 音乐列表 */
export default function MusicList() {
    const [editingMusicList] = useAtom(editingMusicListAtom);
    const selectedIndices = useAtomValue(selectedIndicesAtom);

    const renderItem = ({
        index,
        item: musicItem,
    }: {
        index: number;
        item: IMusic.IMusicItem;
    }) => {
        return (
            <MusicEditorItem
                musicItem={musicItem}
                checked={selectedIndices[index]}
                index={index}
            />
        );
    };

    return (
        <FlatList
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
            style={style.wrapper}
            data={editingMusicList}
            renderItem={renderItem}
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
