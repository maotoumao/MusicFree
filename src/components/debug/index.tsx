import React from "react";
import { StyleSheet, View } from "react-native";
import VDebug from "@/lib/react-native-vdebug";
import { useAppConfig } from "@/core/appConfig";

export default function Debug() {
    const showDebug = useAppConfig("debug.devLog");
    return showDebug ? (
        <View style={style.wrapper} pointerEvents="box-none">
            <VDebug />
        </View>
    ) : null;
}

const style = StyleSheet.create({
    wrapper: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100%",
        height: "100%",
        zIndex: 999,
    },
});
