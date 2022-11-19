import React, {memo, useCallback} from 'react';
import {StatusBar, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import MusicItem from '@/components/mediaItem/musicItem';
import produce from 'immer';
import {useAtom, useSetAtom} from 'jotai';
import {Checkbox} from 'react-native-paper';
import {
    editingMusicListAtom,
    IEditorMusicItem,
    musicListChangedAtom,
} from '../store/atom';
import SortableFlatList from '@/components/base/SortableFlatList';

const ITEM_HEIGHT = rpx(120);
const ITEM_WIDTH = rpx(646);

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
            itemWidth={ITEM_WIDTH}
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
            right={() => <></>}
            itemPaddingRight={0}
            onItemPress={onPress}
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
const marginTop = rpx(88) * 2 + (StatusBar.currentHeight ?? 0);
export default function MusicList() {
    const [editingMusicList, setEditingMusicList] =
        useAtom(editingMusicListAtom);
    const setMusicListChanged = useSetAtom(musicListChangedAtom);

    const renderItem = useCallback(
        ({index, item}: any) => {
            return <MusicEditorItem editorMusicItem={item} index={index!} />;
        },
        [editingMusicList],
    );

    return editingMusicList?.length ? (
        <SortableFlatList
            activeBackgroundColor="rgba(33,33,33,0.8)"
            marginTop={marginTop}
            data={editingMusicList}
            renderItem={renderItem}
            itemHeight={ITEM_HEIGHT}
            onSortEnd={newData => {
                setEditingMusicList(newData);
                setMusicListChanged(true);
            }}
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
