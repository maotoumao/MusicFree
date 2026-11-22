import React from "react";
import Header from "./header";
import MusicList from "@/components/musicList";
import { useParams } from "@/core/router";
import HorizontalSafeAreaView from "@/components/base/horizontalSafeAreaView.tsx";
import globalStyle from "@/constants/globalStyle";
import { useSheetItem } from "@/core/musicSheet";
import { RequestStateCode } from "@/constants/commonConst";
import { useCurrentMusic } from "@/core/trackPlayer";
import type { SharedValue } from "react-native-reanimated";

export default function SheetMusicList(props: { scrollYShared?: SharedValue<number> }) {
    const { scrollYShared } = props;
    const { id = "favorite" } = useParams<"local-sheet-detail">();
    const musicSheet = useSheetItem(id);
    const currentMusic = useCurrentMusic();

    return (
        <HorizontalSafeAreaView style={globalStyle.flex1}>
            <MusicList
                scrollYShared={scrollYShared}
                Header={<Header />}
                musicList={musicSheet?.musicList}
                musicSheet={musicSheet}
                showIndex
                state={RequestStateCode.IDLE}
                highlightMusicItem={currentMusic}

            />
        </HorizontalSafeAreaView>
    );
}
