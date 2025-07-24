import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import NavBar from "./components/navBar";
import { useAtom, useSetAtom } from "jotai";
import {
    PageStatus,
    initSearchResults,
    pageStatusAtom,
    queryAtom,
    searchResultsAtom,
} from "./store/atoms";
import HistoryPanel from "./components/historyPanel";
import ResultPanel from "./components/resultPanel";
import MusicBar from "@/components/musicBar";
import Loading from "@/components/base/loading";
import { SafeAreaView } from "react-native-safe-area-context";
import StatusBar from "@/components/base/statusBar";
import NoPlugin from "../../components/base/noPlugin";
import { useI18N } from "@/core/i18n";

export default function () {
    const [pageStatus, setPageStatus] = useAtom(pageStatusAtom);
    const setQuery = useSetAtom(queryAtom);
    const setSearchResultsState = useSetAtom(searchResultsAtom);
    const { t } = useI18N();

    useEffect(() => {
        setSearchResultsState(initSearchResults);
        return () => {
            setPageStatus(PageStatus.EDITING);
            setQuery("");
        };
    }, []);

    return (
        <SafeAreaView edges={["bottom", "top"]} style={style.wrapper}>
            <StatusBar />
            <NavBar />
            <SafeAreaView edges={["left", "right"]} style={style.wrapper}>
                <View style={style.flex1}>
                    {pageStatus === PageStatus.EDITING && <HistoryPanel />}
                    {pageStatus === PageStatus.SEARCHING && <Loading />}
                    {pageStatus === PageStatus.RESULT && <ResultPanel />}
                    {pageStatus === PageStatus.NO_PLUGIN && (
                        <NoPlugin notSupportType={t("common.search")} />
                    )}
                </View>
            </SafeAreaView>
            <MusicBar />
        </SafeAreaView>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: "100%",
        flex: 1,
    },
    flex1: {
        flex: 1,
    },
});
