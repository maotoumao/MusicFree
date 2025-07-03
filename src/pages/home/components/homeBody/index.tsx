import React from "react";
import globalStyle from "@/constants/globalStyle";
import Operations from "./operations";
import Sheets from "./sheets";
import { ScrollView } from "react-native-gesture-handler";

export default function HomeBody() {
    return (
        <ScrollView
            style={globalStyle.fwflex1}
            showsVerticalScrollIndicator={false}>
            <Operations />
            <Sheets />
        </ScrollView>
    );
}
