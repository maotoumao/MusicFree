import React, { Fragment } from "react";
import { Pressable, StyleSheet } from "react-native";
import rpx from "@/utils/rpx";
import ThemeText from "@/components/base/themeText";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import PanelBase from "../base/panelBase";
import { ScrollView } from "react-native-gesture-handler";
import { hidePanel } from "../usePanel";
import Divider from "@/components/base/divider";
import PanelHeader from "../base/panelHeader";
import { useI18N } from "@/core/i18n";

interface IPlayRateProps {
    /** 点击回调 */
    onRatePress: (rate: number) => void;
}

const rates = [50, 75, 100, 125, 150, 175, 200];

export default function PlayRate(props: IPlayRateProps) {
    const { onRatePress } = props ?? {};
    const i18n = useI18N();

    const safeAreaInsets = useSafeAreaInsets();

    return (
        <PanelBase
            height={rpx(520)}
            renderBody={() => (
                <>
                    <PanelHeader title={i18n.t("panel.playRate.title")} hideButtons />
                    <ScrollView
                        style={[
                            style.body,
                            { marginBottom: safeAreaInsets.bottom },
                        ]}>
                        {rates.map(key => {
                            return (
                                <Fragment key={`frag-${key}`}>
                                    <Pressable
                                        key={`btn-${key}`}
                                        style={style.item}
                                        onPress={() => {
                                            onRatePress(key);
                                            hidePanel();
                                        }}>
                                        <ThemeText>{key / 100}x</ThemeText>
                                    </Pressable>
                                </Fragment>
                            );
                        })}
                        <Divider />
                    </ScrollView>
                </>
            )}
        />
    );
}

const style = StyleSheet.create({
    header: {
        width: "100%",
        flexDirection: "row",
        padding: rpx(24),
    },
    body: {
        flex: 1,
        paddingHorizontal: rpx(24),
    },
    item: {
        height: rpx(96),
        justifyContent: "center",
    },
});
