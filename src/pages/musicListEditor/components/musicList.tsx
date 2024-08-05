import React, {memo, useCallback} from 'react';
import {StatusBar, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import MusicItem from '@/components/mediaItem/musicItem';
import {produce} from 'immer';
import {useAtom, useSetAtom} from 'jotai';
import {
    editingMusicListAtom,
    IEditorMusicItem,
    musicListChangedAtom,
} from '../store/atom';
import SortableFlatList from '@/components/base/SortableFlatList';

import CheckBox from '@/components/base/checkbox';
import useColors from '@/hooks/useColors';
import Empty from '@/components/base/empty';

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
            left={() => (
                <View style={style.checkBox}>
                    <CheckBox checked={editorMusicItem.checked} />
                </View>
            )}
            showMoreIcon={false}
            itemPaddingRight={rpx(100)}
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
    const colors = useColors();

    return editingMusicList?.length ? (
        <SortableFlatList
            activeBackgroundColor={colors.placeholder}
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
        <Empty />
    );
}

const style = StyleSheet.create({
    checkBox: {
        height: '100%',
        justifyContent: 'center',
        marginRight: rpx(16),
    },
});
