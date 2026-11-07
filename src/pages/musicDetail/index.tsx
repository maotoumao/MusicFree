import StatusBar from "@/components/base/statusBar";
import globalStyle from "@/constants/globalStyle";
import useOrientation from "@/hooks/useOrientation";
import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Background from "./components/background";
import Bottom from "./components/bottom";
import Content from "./components/content";
import Lyric from "./components/content/lyric";
import NavBar from "./components/navBar";
import Config from "@/core/appConfig";
import Theme from "@/core/theme";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";

export default function MusicDetail() {
    const orientation = useOrientation();
    const theme = Theme.useTheme();

    useEffect(() => {
        const needAwake = Config.getConfig("basic.musicDetailAwake");
        if (needAwake) {
            activateKeepAwakeAsync();
        }
        return () => {
            if (needAwake) {
                deactivateKeepAwake();
            }
        };
    }, []);

    return (
        <>
            <Background />
            <SafeAreaView style={globalStyle.fwflex1}>
                <StatusBar
                    backgroundColor={"transparent"}
                    barStyle={theme.dark ? "light-content" : "dark-content"}
                />
                <View style={style.bodyWrapper}>
                    <View style={globalStyle.flex1}>
                        <NavBar />
                        <Content />
                        <Bottom />
                    </View>
                    {orientation === "horizontal" ? (
                        <View style={globalStyle.flex1}>
                            <Lyric />
                        </View>
                    ) : null}
                </View>
            </SafeAreaView>
        </>
    );
}

const style = StyleSheet.create({
    bodyWrapper: {
        width: "100%",
        flex: 1,
        flexDirection: "row",
    },
});
