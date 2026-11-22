import React from "react";
import rpx from "@/utils/rpx";
import globalStyle from "@/constants/globalStyle";
import Operations from "./operations";
import Sheets from "./sheets";
import { ScrollView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function HomeBody() {
    const safeAreaInsets = useSafeAreaInsets();
    return (
        <ScrollView
            style={globalStyle.fwflex1}
            contentContainerStyle={{
                paddingBottom: rpx(200) + safeAreaInsets.bottom,
            }}
            showsVerticalScrollIndicator={false}>
            <Operations />
            <Sheets />
        </ScrollView>
    );
}
