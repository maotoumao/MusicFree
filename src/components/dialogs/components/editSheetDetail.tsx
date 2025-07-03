import React, { useState } from "react";
import useColors from "@/hooks/useColors";
import rpx from "@/utils/rpx";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import ThemeText from "@/components/base/themeText";
import { ImgAsset } from "@/constants/assetsConst";
import { launchImageLibrary } from "react-native-image-picker";
import pathConst from "@/constants/pathConst";
import Image from "@/components/base/image";
import { addFileScheme, addRandomHash } from "@/utils/fileUtils";
import Toast from "@/utils/toast";
import { hideDialog } from "../useDialog";
import Dialog from "./base";
import Input from "@/components/base/input";
import { fontSizeConst } from "@/constants/uiConst";
import { copyAsync, deleteAsync, getInfoAsync } from "expo-file-system";
import MusicSheet from "@/core/musicSheet";
import { useI18N } from "@/core/i18n";

interface IEditSheetDetailProps {
    musicSheet: IMusic.IMusicSheetItem;
}
export default function EditSheetDetailDialog(props: IEditSheetDetailProps) {
    const { musicSheet } = props;
    const colors = useColors();

    const [coverImg, setCoverImg] = useState(musicSheet?.coverImg);
    const [title, setTitle] = useState(musicSheet?.title);

    const { t } = useI18N();

    // onCover

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
        if (coverImg === musicSheet?.coverImg && title === musicSheet?.title) {
            hideDialog();
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
                if ((await getInfoAsync(newCoverImg)).exists) {
                    await deleteAsync(newCoverImg, {
                        idempotent: true, // 报错时不抛异常
                    });
                }
                await copyAsync({
                    from: coverImg,
                    to: newCoverImg,
                });
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
            Toast.success("更新歌单信息成功~");
        });
        hideDialog();
    }

    return (
        <Dialog onDismiss={hideDialog}>
            <Dialog.Content>
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
                    <ThemeText>{t("dialog.editSheetDetail.sheetName")}</ThemeText>
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
            </Dialog.Content>
            <Dialog.Actions
                actions={[
                    {
                        title: t("common.cancel"),
                        type: "normal",
                        onPress: hideDialog,
                    },
                    {
                        title: t("common.confirm"),
                        type: "primary",
                        onPress: onConfirm,
                    },
                ]}
            />
        </Dialog>
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
    },
    coverImg: {
        width: rpx(100),
        height: rpx(100),
        borderRadius: rpx(28),
    },
});
