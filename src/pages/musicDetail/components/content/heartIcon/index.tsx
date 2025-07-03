import React from "react";
import { iconSizeConst } from "@/constants/uiConst";
import { useCurrentMusic } from "@/core/trackPlayer";
import Icon from "@/components/base/icon.tsx";
import MusicSheet, { useFavorite } from "@/core/musicSheet";

export default function () {
    const musicItem = useCurrentMusic();

    const isFavorite = useFavorite(musicItem);

    return isFavorite ? (
        <Icon
            name="heart"
            size={iconSizeConst.normal}
            color="red"
            onPress={() => {
                if (!musicItem) {
                    return;
                }
                MusicSheet.removeMusic(MusicSheet.defaultSheet.id, musicItem);
            }}
        />
    ) : (
        <Icon
            name="heart-outline"
            size={iconSizeConst.normal}
            color="white"
            onPress={() => {
                if (musicItem) {
                    MusicSheet.addMusic(MusicSheet.defaultSheet.id, musicItem);
                }
            }}
        />
    );
}
