import React from "react";
import { StyleSheet, View } from "react-native";
import rpx, { vmax } from "@/utils/rpx";
import ListItem from "@/components/base/listItem";
import { ImgAsset } from "@/constants/assetsConst";
import Toast from "@/utils/toast";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import PanelBase from "../base/panelBase";
import { FlatList } from "react-native-gesture-handler";
import { hidePanel, showPanel } from "../usePanel";
import PanelHeader from "../base/panelHeader";
import MusicSheet, { useSheetsBase } from "@/core/musicSheet";
import { subscribeSheet } from "@/core/syncSubscription";
import { useI18N } from "@/core/i18n";

interface IAddToMusicSheetProps {
    musicItem: IMusic.IMusicItem | IMusic.IMusicItem[];
    // 如果是新建歌单，可以传入一个默认的名称
    newSheetDefaultName?: string;
    /**
     * 订阅来源：从「导入歌单」进来时带上（分享链接 + 来源插件）。
     * 有值时，导入完成后把来源记到目标歌单上，之后就能一键同步。
     */
    subscription?: {
        url: string;
        platform: string;
    };
}

export default function AddToMusicSheet(props: IAddToMusicSheetProps) {
    const sheets = useSheetsBase();

    const { musicItem = [], newSheetDefaultName, subscription } = props ?? {};
    const safeAreaInsets = useSafeAreaInsets();
    const { t } = useI18N();

    return (
        <PanelBase
            renderBody={() => (
                <>
                    <PanelHeader
                        hideButtons
                        title={
                            t("panel.addToMusicSheet.title", {
                                count: Array.isArray(musicItem) ? musicItem.length : 1,
                            })
                        }
                    />
                    <View style={style.wrapper}>
                        <FlatList
                            data={sheets ?? []}
                            keyExtractor={sheet => sheet.id}
                            style={{
                                marginBottom: safeAreaInsets.bottom,
                            }}
                            ListHeaderComponent={
                                <ListItem
                                    withHorizontalPadding
                                    key="new"
                                    onPress={() => {
                                        showPanel("CreateMusicSheet", {
                                            defaultName: newSheetDefaultName,
                                            async onSheetCreated(sheetId) {
                                                try {
                                                    await MusicSheet.addMusic(
                                                        sheetId,
                                                        musicItem,
                                                    );
                                                    if (subscription) {
                                                        await subscribeSheet(
                                                            sheetId,
                                                            subscription.url,
                                                            subscription.platform,
                                                        );
                                                        Toast.success(
                                                            t("panel.addToMusicSheet.toast.subscribed"),
                                                        );
                                                    } else {
                                                        Toast.success(
                                                            t("panel.addToMusicSheet.toast.success"),
                                                        );
                                                    }
                                                } catch {
                                                    Toast.warn(
                                                        t("panel.addToMusicSheet.toast.fail"),
                                                    );
                                                }
                                            },
                                            onCancel() {
                                                showPanel("AddToMusicSheet", {
                                                    musicItem: musicItem,
                                                    newSheetDefaultName,
                                                });
                                            },
                                        });
                                    }}>
                                    <ListItem.ListItemImage
                                        fallbackImg={ImgAsset.add}
                                    />
                                    <ListItem.Content title={t("panel.addToMusicSheet.newMusicSheet")} />
                                </ListItem>
                            }
                            renderItem={({ item: sheet }) => (
                                <ListItem
                                    withHorizontalPadding
                                    key={`${sheet.id}`}
                                    onPress={async () => {
                                        try {
                                            await MusicSheet.addMusic(
                                                sheet.id,
                                                musicItem,
                                            );
                                            if (subscription) {
                                                await subscribeSheet(
                                                    sheet.id,
                                                    subscription.url,
                                                    subscription.platform,
                                                );
                                            }
                                            hidePanel();
                                            Toast.success(
                                                subscription
                                                    ? t("panel.addToMusicSheet.toast.subscribed")
                                                    : t("panel.addToMusicSheet.toast.success"),
                                            );
                                            Toast.success(t("panel.addToMusicSheet.toast.success"));
                                        } catch {
                                            Toast.warn(t("panel.addToMusicSheet.toast.fail"));
                                        }
                                    }}>
                                    <ListItem.ListItemImage
                                        uri={sheet.coverImg}
                                        fallbackImg={ImgAsset.albumDefault}
                                    />
                                    <ListItem.Content
                                        title={sheet.title}
                                        description={t("panel.addToMusicSheet.count", {
                                            count: sheet.worksNum ?? "-",
                                        })}
                                    />
                                </ListItem>
                            )}
                        />
                    </View>
                </>
            )}
            height={vmax(70)}
        />
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: "100%",
        flex: 1,
    },
    header: {
        paddingHorizontal: rpx(24),
        marginTop: rpx(36),
        marginBottom: rpx(36),
    },
});
