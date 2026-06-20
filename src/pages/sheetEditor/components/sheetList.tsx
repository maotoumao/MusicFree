import SortableFlashList from "@/components/base/sortableFlashList";
import rpx from "@/utils/rpx";
import { useAtom, useSetAtom } from "jotai";
import { StyleSheet, View } from "react-native";
import { editingMusicSheetAtom, IEditorMusicSheetItem, musicSheetChangedAtom } from "../store/atom";
import React, { memo, useCallback, useMemo } from "react";
import { useI18N } from "@/core/i18n";
import TextButton from "@/components/base/textButton";
import { produce } from "immer";
import ListItem from "@/components/base/listItem";
import { ImgAsset } from "@/constants/assetsConst";
import { localPluginPlatform } from "@/constants/commonConst";
import Checkbox from "@/components/base/checkbox";
import useColors from "@/hooks/useColors";
import Empty from "@/components/base/empty";


interface ISheetEditorItemProps {
    index: number;
    editorMusicSheet: IEditorMusicSheetItem;
}
function _SheetEditorItem(props: ISheetEditorItemProps) {
    const { index, editorMusicSheet } = props;
    const sheet = editorMusicSheet.musicSheetItem;
    const { t } = useI18N();

    const setEditingMusicSheet = useSetAtom(editingMusicSheetAtom);

    const onPress = useCallback(() => {
        setEditingMusicSheet(
            produce(draft => {
                draft[index].checked = !draft[index].checked;
            }),
        );
    }, [index]);

    const isLocalSheet = !(
        sheet.platform && sheet.platform !== localPluginPlatform
    );

    return (
        <ListItem
            heightType="big"
            withHorizontalPadding
            style={styles.sheetItemContainer}
            onPress={onPress}
        >
            <View style={styles.checkBox}>
                <Checkbox checked={editorMusicSheet.checked} />
            </View>
            <ListItem.ListItemImage
                uri={sheet.coverImg ?? sheet.artwork}
                fallbackImg={ImgAsset.albumDefault}
            />
            <ListItem.Content
                title={sheet.title}
                description={
                    isLocalSheet
                        ? t("home.songCount", { count: sheet.worksNum })
                        : `${sheet.artist ?? ""}`
                }
            />
        </ListItem>
    );
}

const SheetEditorItem = memo(
    _SheetEditorItem,
    (prev, curr) =>
        prev.editorMusicSheet === curr.editorMusicSheet &&
        prev.index === curr.index,
);

export default function SheetList() {

    const { t } = useI18N();

    const [editingSheetList, setEditingMusicList] = useAtom(editingMusicSheetAtom);
    const setSheetChanged = useSetAtom(musicSheetChangedAtom);
    const selectedItems = useMemo(() => editingSheetList.filter(_ => _.checked), [editingSheetList]);
    const colors = useColors();

    return (
        <>
            <View style={styles.header}>
                <TextButton
                    onPress={() => {
                        if (
                            selectedItems.length !== editingSheetList.length &&
                            editingSheetList.length
                        ) {
                            setEditingMusicList(
                                editingSheetList.map(_ => ({
                                    musicSheetItem: _.musicSheetItem,
                                    checked: true,
                                })),
                            );
                        } else {
                            setEditingMusicList(
                                editingSheetList.map(_ => ({
                                    musicSheetItem: _.musicSheetItem,
                                    checked: false,
                                })),
                            );
                        }
                    }}>
                    {`${((selectedItems.length !== editingSheetList.length &&
                        editingSheetList.length) || !editingSheetList.length)
                        ? t("common.selectAll")
                        : t("common.unselectAll")
                    } (${t("musicSheetEditor.selectSheetCount", { count: selectedItems.length })})`}
                </TextButton>
            </View>
            {editingSheetList.length === 0 ? <Empty /> : <SortableFlashList 
                activeBackgroundColor={colors.placeholder}
                estimatedItemSize={ListItem.Size.big}
                data={editingSheetList} 
                renderItem={({ item, index }) => <SheetEditorItem index={index} editorMusicSheet={item} />} 
                onSortEnd={newData => {
                    setEditingMusicList(newData);
                    setSheetChanged(true);
                }}
            />}
        </>
    );
}


const styles = StyleSheet.create({
    checkBox: {
        height: "100%",
        justifyContent: "center",
        marginRight: rpx(24),
    },
    header: {
        flexDirection: "row",
        height: rpx(88),
        paddingHorizontal: rpx(24),
        alignItems: "center",
        justifyContent: "space-between",
    },
    sheetItemContainer: {
        paddingRight: rpx(100),
    },
});