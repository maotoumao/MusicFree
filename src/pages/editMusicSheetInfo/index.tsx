import AppBar from "@/components/base/appBar.tsx";
import IconTextButton from "@/components/base/iconTextButton";
import Image from "@/components/base/image.tsx";
import ListItem from "@/components/base/listItem";
import VerticalSafeAreaView from "@/components/base/verticalSafeAreaView";
import { showPanel } from "@/components/panels/usePanel.ts";
import { ImgAsset } from "@/constants/assetsConst.ts";
import globalStyle from "@/constants/globalStyle.ts";
import pathConst from "@/constants/pathConst.ts";
import { iconSizeConst } from "@/constants/uiConst.ts";
import { useI18N } from "@/core/i18n";
import MusicSheet from "@/core/musicSheet";
import { useParams } from "@/core/router";
import useColors from "@/hooks/useColors";
import { addFileScheme, addRandomHash } from "@/utils/fileUtils";
import rpx from "@/utils/rpx";
import Toast from "@/utils/toast";
import { readAsStringAsync } from "expo-file-system";
import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { exists, unlink, writeFile } from "react-native-fs";
import { launchImageLibrary } from "react-native-image-picker";


export default function EditMusicSheetInfo() {
    const { musicSheet } = useParams<"edit-music-sheet-info">();
    const colors = useColors();
    const { t } = useI18N();

    const [coverImg, setCoverImg] = useState(musicSheet?.coverImg);
    const [title, setTitle] = useState(musicSheet?.title);

    const setCoverImageHandler = async (resetCover: boolean = false) => {
        let newCoverImg = coverImg;
        
        if (resetCover) {
            newCoverImg = undefined;
        } else {
            // 选择图片
            try {
                const result = await launchImageLibrary({
                    mediaType: "photo",
                });
                const uri = result.assets?.[0].uri;
                if (!uri) {
                    return;
                }
                newCoverImg = uri;
            } catch (e) {
                console.log(e);
                return;
            }
        }

        setCoverImg(newCoverImg);
        if (newCoverImg && newCoverImg !== musicSheet?.coverImg) {
            const targetImagePath = addFileScheme(
                `${pathConst.dataPath}sheet${musicSheet.id}${newCoverImg.substring(
                    newCoverImg.lastIndexOf("."),
                )}`,
            );
            try {
                if ((await exists(targetImagePath))) {
                    await unlink(targetImagePath);
                }
                // Copy
                const rawImage = await readAsStringAsync(newCoverImg, {
                    encoding: "base64",
                });
                await writeFile(targetImagePath, rawImage, "base64");
            } catch (e) {
                console.log(e);
            }
        }

        // 更新歌单信息
        MusicSheet.updateMusicSheetBase(musicSheet.id, {
            coverImg: newCoverImg ? addRandomHash(newCoverImg) : undefined,
        }).then(() => {
            Toast.success(t("editMusicSheetInfo.toast.success"));
        });

    };

    const changeSheetTitleHandler = () => {
        if (musicSheet.id === MusicSheet.defaultSheet.id) {
            Toast.warn(t("editMusicSheetInfo.toast.defaultSheetRenameFail"));
            return;
        }
        showPanel("SimpleInput", {
            title: t("editMusicSheetInfo.changeSheetName"),
            placeholder: title,
            maxLength: 200,
            onOk(text, closePanel) {
                if (!text || text.length === 0) {
                    closePanel();
                    return;
                }
                if (text === title) {
                    closePanel();
                    return;
                }
                setTitle(text);
                MusicSheet.updateMusicSheetBase(musicSheet.id, {
                    title: text,
                }).then(() => {
                    Toast.success(t("editMusicSheetInfo.toast.success"));
                });
                closePanel();
            },

        });
    };

    return (
        <VerticalSafeAreaView style={globalStyle.fwflex1}>
            <AppBar withStatusBar>
                {t("editMusicSheetInfo.title")}
            </AppBar>
            <View style={styles.coverContainer}>
                <Image
                    style={styles.coverImg}
                    uri={coverImg}
                    emptySrc={ImgAsset.albumDefault}
                />
                <View style={styles.coverButtonGroup}>
                    <IconTextButton onPress={() => setCoverImageHandler()} icon='photo' withBorder>{t("editMusicSheetInfo.changeCoverImageButton")}</IconTextButton>
                    <IconTextButton onPress={() => setCoverImageHandler(true)} icon='reset-left-line' withBorder>{t("editMusicSheetInfo.resetCoverImageButton")}</IconTextButton>
                </View>
            </View>
            <ListItem onPress={changeSheetTitleHandler} withHorizontalPadding rightPadding={0}>
                <ListItem.Content containerStyle={styles.listItemTitleContainer} title={t("editMusicSheetInfo.sheetName")} />
                <ListItem.ListItemText containerStyle={styles.listItemContentContainer} fontColor='textSecondary' contentProps={{
                    numberOfLines: 2,
                }}>{title}</ListItem.ListItemText>
                <ListItem.ListItemIcon color={colors.textSecondary} iconSize={iconSizeConst.small} icon='chevron-right' />
            </ListItem>
        </VerticalSafeAreaView>
    );
}

const styles = StyleSheet.create({
    coverContainer: {
        alignItems: "center",
        marginVertical: rpx(36),
        rowGap: rpx(36),
    },
    coverImg: {
        width: rpx(240),
        height: rpx(240),
        borderRadius: rpx(8),
    },
    coverButtonGroup: {
        flexDirection: "row",
        columnGap: rpx(36),
    },
    listItemTitleContainer: {
        flexGrow: 0.5,
        flexShrink: 0,
        flexBasis: "auto",
    },
    listItemContentContainer: {
        flexGrow: 1,
        flexBasis: 0,
        justifyContent: "flex-end",
    },
});
