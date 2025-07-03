import AppBar from "@/components/base/appBar.tsx";
import Image from "@/components/base/image.tsx";
import Input from "@/components/base/input.tsx";
import ThemeText from "@/components/base/themeText.tsx";
import VerticalSafeAreaView from "@/components/base/verticalSafeAreaView.tsx";
import PanelFullscreen from "@/components/panels/base/panelFullscreen.tsx";
import { hidePanel } from "@/components/panels/usePanel.ts";
import { ImgAsset } from "@/constants/assetsConst.ts";
import globalStyle from "@/constants/globalStyle.ts";
import pathConst from "@/constants/pathConst.ts";
import { fontSizeConst } from "@/constants/uiConst.ts";
import { useI18N } from "@/core/i18n";
import MusicSheet from "@/core/musicSheet";
import useColors from "@/hooks/useColors.ts";
import { addFileScheme, addRandomHash } from "@/utils/fileUtils.ts";
import rpx from "@/utils/rpx";
import Toast from "@/utils/toast.ts";
import { readAsStringAsync } from "expo-file-system";
import React, { useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { exists, unlink, writeFile } from "react-native-fs";
import { launchImageLibrary } from "react-native-image-picker";

interface IEditSheetDetailProps {
  musicSheet: IMusic.IMusicSheetItem;
}

export default function EditMusicSheetInfo(props: IEditSheetDetailProps) {
    const { musicSheet } = props;
    const colors = useColors();
    const { t } = useI18N();

    const [coverImg, setCoverImg] = useState(musicSheet?.coverImg);
    const [title, setTitle] = useState(musicSheet?.title);

    const onChangeCoverPress = async () => {
        try {
            const result = await launchImageLibrary({
                mediaType: "photo",
            });
            const uri = result.assets?.[0].uri;
            if (!uri) {
                return;
            }
            console.log(uri);
            setCoverImg(uri);
        } catch (e) {
            console.log(e);
        }
    };

    function onTitleChange(_: string) {
        setTitle(_);
    }

    async function onConfirm() {
    // 判断是否相同
        if (
            coverImg === musicSheet?.coverImg &&
      title === musicSheet?.title
        ) {
            hidePanel();
            return;
        }

        let newCoverImg = coverImg;
        if (coverImg && coverImg !== musicSheet?.coverImg) {
            newCoverImg = addFileScheme(
                `${pathConst.dataPath}sheet${musicSheet.id}${coverImg.substring(
                    coverImg.lastIndexOf("."),
                )}`,
            );
            try {
                if ((await exists(newCoverImg))) {
                    await unlink(newCoverImg);
                }

                // Copy
                const rawImage = await readAsStringAsync(coverImg, {
                    encoding: "base64",
                });
                await writeFile(newCoverImg, rawImage, "base64");
            } catch (e) {
                console.log(e);
            }
        }
        let _title = title;
        if (!_title?.length) {
            _title = musicSheet.title;
        }
        // 更新歌单信息
        MusicSheet.updateMusicSheetBase(musicSheet.id, {
            coverImg: newCoverImg ? addRandomHash(newCoverImg) : undefined,
            title: _title,
        }).then(() => {
            Toast.success(t("panel.editMusicSheetInfo.toast.updateSuccess"));
        });
        hidePanel();
    }

    return (
        <PanelFullscreen>
            <VerticalSafeAreaView style={globalStyle.fwflex1}>
                <AppBar onBackPress={hidePanel} withStatusBar>
                    {t("panel.editMusicSheetInfo.title")}
                </AppBar>
                <View style={style.row}>
                    <ThemeText>{t("common.cover")}</ThemeText>
                    <TouchableOpacity
                        onPress={onChangeCoverPress}
                        onLongPress={() => {
                            setCoverImg(undefined);
                        }}>
                        <Image
                            style={style.coverImg}
                            uri={coverImg}
                            emptySrc={ImgAsset.albumDefault}
                        />
                    </TouchableOpacity>
                </View>
                <View style={style.row}>
                    <ThemeText>{t("panel.editMusicSheetInfo.sheetName")}</ThemeText>
                    <Input
                        numberOfLines={1}
                        textAlign="right"
                        value={title}
                        hasHorizontalPadding={false}
                        onChangeText={onTitleChange}
                        style={{
                            height: fontSizeConst.content * 2.5,
                            width: "50%",
                            borderBottomWidth: 1,
                            includeFontPadding: false,
                            borderBottomColor: colors.text,
                        }}
                    />
                </View>
                <TouchableOpacity
                    activeOpacity={0.6}
                    onPress={onConfirm}
                    style={[
                        {
                            backgroundColor: colors.primary,
                        },
                        style.button,
                    ]}>
                    <ThemeText color={"white"}>{t("common.confirm")}</ThemeText>
                </TouchableOpacity>
            </VerticalSafeAreaView>
        </PanelFullscreen>
    );
}

const style = StyleSheet.create({
    row: {
        marginTop: rpx(28),
        height: rpx(120),
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingBottom: rpx(12),
        paddingHorizontal: rpx(24),
    },
    coverImg: {
        width: rpx(100),
        height: rpx(100),
        borderRadius: rpx(28),
    },
    button: {
        marginHorizontal: rpx(24),
        borderRadius: rpx(8),
        height: rpx(72),
        marginTop: rpx(24),
        justifyContent: "center",
        alignItems: "center",
    },
});
