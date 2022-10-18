import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import {FlatList} from 'react-native-gesture-handler';
import Button from '@/components/base/button';
import {useAtom, useSetAtom} from 'jotai';
import {
    editingMusicListAtom,
    musicListChangedAtom,
    selectedIndicesAtom,
} from '../store/atom';
import Empty from '@/components/base/empty';
import MusicItem from '@/components/mediaItem/musicItem';
import {Checkbox} from 'react-native-paper';
import produce from 'immer';
import MusicSheet from '@/core/musicSheet';
import Toast from '@/utils/toast';

const ITEM_HEIGHT = rpx(120);
interface IBodyProps {
    musicSheet: IMusic.IMusicSheetItem;
}
export default function Body(props: IBodyProps) {
    const {musicSheet} = props;
    const [editingMusicList] = useAtom(editingMusicListAtom);
    const [selectedIndices, setSelectedIndices] = useAtom(selectedIndicesAtom);
    const setMusicListChanged = useSetAtom(musicListChangedAtom);
    const selectedItems = useMemo(
        () => () =>
            editingMusicList.filter((_, index) => selectedIndices[index]),
        [editingMusicList, selectedIndices],
    );
    return (
        <>
            <View style={style.header}>
                <Button
                    onPress={() => {
                        if (
                            selectedItems().length !==
                                editingMusicList.length &&
                            editingMusicList.length
                        ) {
                            setSelectedIndices(
                                Array(editingMusicList.length).fill(true),
                            );
                        } else {
                            setSelectedIndices([]);
                        }
                    }}>
                    {`${
                        selectedItems().length !== editingMusicList.length &&
                        editingMusicList.length
                            ? '全选'
                            : '全不选'
                    } (已选${selectedIndices.filter(_ => _).length}首)`}
                </Button>
                <Button
                    onPress={async () => {
                        if (musicSheet.id) {
                            await MusicSheet.updateAndSaveSheet(musicSheet.id, {
                                musicList: editingMusicList,
                            });
                            Toast.success('保存成功');
                        }
                        setMusicListChanged(true);
                    }}>
                    保存
                </Button>
            </View>
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
                renderItem={({index, item: musicItem}) => {
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
                                                        draft[index] =
                                                            !draft[index];
                                                    }),
                                                );
                                            }}
                                            status={
                                                selectedIndices[index]
                                                    ? 'checked'
                                                    : 'unchecked'
                                            }
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
                }}
            />
        </>
    );
}

const style = StyleSheet.create({
    header: {
        flexDirection: 'row',
        height: rpx(88),
        paddingHorizontal: rpx(24),
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    wrapper: {
        width: rpx(750),
        flex: 1,
    },
    checkBox: {
        height: '100%',
        justifyContent: 'center',
    },
});
