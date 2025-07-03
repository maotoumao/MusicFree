import React from "react";
import MusicList from "@/components/musicList";
import LocalMusicSheet from "@/core/localMusicSheet";
import { localMusicSheetId, localPluginPlatform, RequestStateCode } from "@/constants/commonConst";
import HorizontalSafeAreaView from "@/components/base/horizontalSafeAreaView.tsx";
import globalStyle from "@/constants/globalStyle";
import { useI18N } from "@/core/i18n";

export default function LocalMusicList() {
    const musicList = LocalMusicSheet.useMusicList();
    const { t } = useI18N();

    return (
        <HorizontalSafeAreaView style={globalStyle.flex1}>
            <MusicList
                musicList={musicList}
                showIndex
                state={RequestStateCode.IDLE}
                musicSheet={{
                    id: localMusicSheetId,
                    title: t("common.local"),
                    platform: localPluginPlatform,
                    musicList: musicList,
                }}
            />
        </HorizontalSafeAreaView>
    );
}
