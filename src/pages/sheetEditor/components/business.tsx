import { getDefaultStore, useAtomValue, useSetAtom } from "jotai";
import { editingMusicSheetAtom, musicSheetChangedAtom, sheetTypeAtom } from "../store/atom";
import { useEffect, useRef } from "react";
import MusicSheet from "@/core/musicSheet";
import { showDialog } from "@/components/dialogs/useDialog";
import { useNavigation } from "@react-navigation/native";
import { saveEditingMusicSheet } from "../store/action";
import Toast from "@/utils/toast";
import i18n from "@/core/i18n";
import { useParams } from "@/core/router";

export default function Business() {
    const { sheetType } = useParams<"sheet-editor">();
    const selectedSheetType = useAtomValue(sheetTypeAtom);
    const setEditingMusicSheetAtom = useSetAtom(editingMusicSheetAtom);
    const setMusicSheetChangedAtom = useSetAtom(musicSheetChangedAtom);
    const navigation = useNavigation();
    const doubleConfirmRef = useRef(false);

    useEffect(() => {
        getDefaultStore().set(sheetTypeAtom, sheetType);
    }, [sheetType]);

    useEffect(() => {
        const sheets = selectedSheetType === "starred" ? MusicSheet.getStarredSheets() : MusicSheet.getSheets().slice(1);
        setEditingMusicSheetAtom(sheets.map(it => ({
            checked: false,
            musicSheetItem: it,
        })));
    }, [selectedSheetType]);


    useEffect(() => {
        const navigationBackHandler = (e) => {
            if (e.data.action.type === "GO_BACK" && !doubleConfirmRef.current && getDefaultStore().get(musicSheetChangedAtom)) {
                e.preventDefault();
                showDialog("SimpleDialog", {
                    "title": i18n.t("dialog.simpleDialog.hasUnsavedChange.title"),
                    "content": i18n.t("dialog.simpleDialog.hasUnsavedChange.content"),
                    okText: i18n.t("common.save"),
                    cancelText: i18n.t("common.notSave"),
                    onOk() {
                        saveEditingMusicSheet();
                        doubleConfirmRef.current = true;
                        Toast.success(i18n.t("toast.saveSuccess"));
                        navigation.goBack();
                    },
                    onCancel() {
                        doubleConfirmRef.current = true;
                        navigation.goBack();
                    },
                    onDismiss() {
                        doubleConfirmRef.current = false;
                    },
                });
            }
        };
        navigation.addListener("beforeRemove", navigationBackHandler);

        return () => {
            setEditingMusicSheetAtom([]);
            setMusicSheetChangedAtom(false);
            navigation.removeListener("beforeRemove", navigationBackHandler);
        };
    }, []);

    return null;
}
