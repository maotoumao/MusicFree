import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";
import ThemeText from "@/components/base/themeText";

import PanelBase from "../base/panelBase";
import Slider from "@react-native-community/slider";
import useColors from "@/hooks/useColors";
import PanelHeader from "../base/panelHeader";
import { useI18N } from "@/core/i18n";

interface IProps {
    defaultSelect?: number;
    /** 点击回调 */
    onSelectChange: (value: number) => void;
}

export default function SetFontSize(props: IProps) {
    const { defaultSelect, onSelectChange } = props ?? {};
    const colors = useColors();
    const i18n = useI18N();
    const [selected, setSelected] = useState(defaultSelect ?? 1);

    return (
        <PanelBase
            height={rpx(520)}
            keyboardAvoidBehavior="none"
            renderBody={() => (
                <>
                    <PanelHeader title={i18n.t("panel.setFontSize.title")} hideButtons />
                    <View style={styles.container}>
                        <Slider
                            style={styles.sliderContainer}
                            thumbTintColor={colors.primary}
                            minimumTrackTintColor={colors.primary}
                            value={selected}
                            step={1}
                            onValueChange={val => {
                                setSelected(val);
                                onSelectChange?.(val);
                            }}
                            minimumValue={0}
                            maximumValue={3}
                        />
                        <ThemeText style={styles.label}>{i18n.t("panel.setFontSize.small")}</ThemeText>
                        <ThemeText style={[styles.label, styles.label1]}>
                            {i18n.t("panel.setFontSize.standard")}
                        </ThemeText>
                        <ThemeText style={[styles.label, styles.label2]}>
                            {i18n.t("panel.setFontSize.large")}
                        </ThemeText>
                        <ThemeText style={[styles.label, styles.label3]}>
                            {i18n.t("panel.setFontSize.extraLarge")}
                        </ThemeText>
                    </View>
                </>
            )}
        />
    );
}

const styles = StyleSheet.create({
    header: {
        width: "100%",
        flexDirection: "row",
        padding: rpx(24),
    },
    container: {
        flex: 1,
        paddingHorizontal: rpx(24),
        width: "100%",
        marginTop: rpx(88),
    },
    sliderContainer: {
        height: rpx(80),
    },
    label: {
        position: "absolute",
        top: rpx(80),
        width: rpx(72),
        textAlign: "center",
        left: rpx(24),
        opacity: 0.5,
    },
    label1: {
        left: rpx(234),
    },
    label2: {
        left: rpx(442),
    },
    label3: {
        left: rpx(646),
    },
});
