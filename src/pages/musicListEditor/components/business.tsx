import { useParams } from "@/core/router";
import { getDefaultStore, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import { editingMusicListAtom, musicListChangedAtom } from "../store/atom";
import { showDialog } from "@/components/dialogs/useDialog";
import i18n from "@/core/i18n";
import { useNavigation } from "@react-navigation/native";
import Toast from "@/utils/toast";
import { saveEditingMusicList } from "../store/action";

export default function Business() {
    const { musicSheet, musicList } = useParams<"music-list-editor">();
    const doubleConfirmRef = useRef(false);
    const navigation = useNavigation();

    const setEditingMusicList = useSetAtom(editingMusicListAtom);
    const setMusicListChanged = useSetAtom(musicListChangedAtom);

    useEffect(() => {
        setEditingMusicList(
            (musicList ?? []).map(_ => ({ musicItem: _, checked: false })),
        );

        const navigationBackHandler = (e) => {
            if (e.data.action.type === "GO_BACK" && !doubleConfirmRef.current && getDefaultStore().get(musicListChangedAtom)) {
                e.preventDefault();
                showDialog("SimpleDialog", {
                    "title": i18n.t("dialog.simpleDialog.hasUnsavedChange.title"),
                    "content": i18n.t("dialog.simpleDialog.hasUnsavedChange.content"),
                    okText: i18n.t("common.save"),
                    cancelText: i18n.t("common.notSave"),
                    onOk() {
                        if (musicSheet?.id) {
                            saveEditingMusicList(musicSheet.id);
                            Toast.success(i18n.t("toast.saveSuccess"));
                        }
                        doubleConfirmRef.current = true;
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
            setEditingMusicList([]);
            setMusicListChanged(false);
            navigation.removeListener("beforeRemove", navigationBackHandler);
        };
    }, []);

    return null;
}
