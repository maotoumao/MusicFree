import AppBar from "@/components/base/appBar";
import IconButton from "@/components/base/iconButton";
import i18n, { useI18N } from "@/core/i18n";
import { useParams } from "@/core/router";
import useColors from "@/hooks/useColors";
import { useAtomValue } from "jotai";
import { musicListChangedAtom } from "../store/atom";
import { saveEditingMusicList } from "../store/action";
import Toast from "@/utils/toast";

export default function NavBar() {
    const { musicSheet } = useParams<"music-list-editor">();
    const { t } = useI18N();

    const colors = useColors();
    const isDirty = useAtomValue(musicListChangedAtom);

    return (
        <AppBar actionComponent={<IconButton
            name="save-outline"
            sizeType="normal"
            color={isDirty ? colors.primary : colors.appBarText}
            opacity={isDirty ? 1 : 0.6}
            onPress={() => {
                if (isDirty && musicSheet?.id) {
                    saveEditingMusicList(musicSheet.id);
                    Toast.success(t("toast.saveSuccess"));
                }
            }}
        />}>{musicSheet?.title ?? i18n.t("common.sheet")}</AppBar>
    );
}
