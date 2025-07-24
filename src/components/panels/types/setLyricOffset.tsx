import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";
import ThemeText from "@/components/base/themeText";

import PanelBase from "../base/panelBase";
import { iconSizeConst } from "@/constants/uiConst";
import PanelHeader from "../base/panelHeader";
import { TouchableOpacity } from "react-native-gesture-handler";
import { hidePanel } from "../usePanel";
import useColors from "@/hooks/useColors";
import Icon from "@/components/base/icon.tsx";
import { getMediaExtraProperty } from "@/utils/mediaExtra";
import { useI18N } from "@/core/i18n";

interface IProps {
    musicItem: IMusic.IMusicItem;
    /** 点击回调 */
    onSubmit?: (offset: number) => void;
}

export default function SetLyricOffset(props: IProps) {
    const { musicItem, onSubmit } = props ?? {};
    const { t } = useI18N();

    const [offset, setOffset] = useState(
        getMediaExtraProperty(musicItem, "lyricOffset") ?? 0
    );

    const colors = useColors();

    let titleStr =
        offset === 0
            ? t("panel.setLyricOffset.normal")
            : offset < 0
                ? t("panel.setLyricOffset.delay", { time: (-offset).toFixed(1) })
                : t("panel.setLyricOffset.advance", { time: offset.toFixed(1) });

    return (
        <PanelBase
            height={rpx(520)}
            keyboardAvoidBehavior="none"
            renderBody={() => (
                <>
                    <PanelHeader
                        title={t("panel.setLyricOffset.title", { status: titleStr })}
                        onOk={() => {
                            onSubmit?.(offset);
                        }}
                        onCancel={hidePanel}
                    />
                    <View style={styles.container}>
                        <TouchableOpacity
                            style={styles.btn}
                            onPress={() => {
                                setOffset(prev => prev - 0.2);
                            }}>
                            <Icon
                                name="minus"
                                size={iconSizeConst.big}
                                color={colors.text}
                            />
                            <ThemeText>-0.2s</ThemeText>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.btn}
                            onPress={() => {
                                setOffset(0);
                            }}>
                            <Icon
                                name="arrow-uturn-left"
                                size={iconSizeConst.big}
                                color={colors.text}
                            />
                            <ThemeText>{t("panel.setLyricOffset.reset")}</ThemeText>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.btn}
                            onPress={() => {
                                setOffset(prev => prev + 0.2);
                            }}>
                            <Icon
                                name="plus"
                                size={iconSizeConst.big}
                                color={colors.text}
                            />
                            <ThemeText>+0.2s</ThemeText>
                        </TouchableOpacity>
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
        paddingBottom: rpx(36),
        width: "100%",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-around",
    },
    btn: {
        width: rpx(144),
        height: rpx(144),
        alignItems: "center",
        justifyContent: "space-around",
    },
});
