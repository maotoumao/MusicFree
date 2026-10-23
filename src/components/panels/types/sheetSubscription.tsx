import ThemeSwitch from "@/components/base/switch";
import ListItem from "@/components/base/listItem";
import PanelHeader from "../base/panelHeader";
import { showDialog } from "@/components/dialogs/useDialog";
import { hidePanel } from "../usePanel";
import PanelBase from "../base/panelBase";
import MusicSheet, { useSheetItem } from "@/core/musicSheet";
import {
    isSyncable,
    subscribeSheet,
    syncSheet,
    unsubscribeSheet,
} from "@/core/syncSubscription";
import { useI18N } from "@/core/i18n";
import Toast from "@/utils/toast";
import rpx, { vmax } from "@/utils/rpx";
import React, { useMemo } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface ISheetSubscriptionProps {
    sheetId: string;
}

/** 把时间戳格式化成「x 小时前」这样的相对时间 */
function formatLastSyncAt(lastSyncAt?: number, t?: any) {
    if (!lastSyncAt) {
        return t ? t("panel.sheetSubscription.neverSync") : "从未同步";
    }
    const diff = Date.now() - lastSyncAt;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) {
        return t ? t("panel.sheetSubscription.justNow") : "刚刚";
    }
    if (minutes < 60) {
        return `${minutes} ${t ? t("panel.sheetSubscription.minutesAgo") : "分钟前"}`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `${hours} ${t ? t("panel.sheetSubscription.hoursAgo") : "小时前"}`;
    }
    const days = Math.floor(hours / 24);
    return `${days} ${t ? t("panel.sheetSubscription.daysAgo") : "天前"}`;
}

export default function SheetSubscription(props: ISheetSubscriptionProps) {
    const { sheetId } = props ?? {};
    const sheet = useSheetItem(sheetId);
    const { t } = useI18N();
    const safeAreaInsets = useSafeAreaInsets();

    const subscription = sheet?.subscription as IMusic.ISubscription | undefined;
    const syncable = useMemo(() => isSyncable(sheet), [sheet]);

    if (!syncable) {
        return (
            <PanelBase
                height={vmax(40)}
                renderBody={() => (
                    <>
                        <PanelHeader
                            hideButtons
                            title={t("panel.sheetSubscription.title")}
                        />
                        <ListItem withHorizontalPadding>
                            <ListItem.Content
                                title={t("panel.sheetSubscription.notSyncable")}
                                description={t(
                                    "panel.sheetSubscription.notSyncableDesc",
                                )}
                            />
                        </ListItem>
                    </>
                )}
            />
        );
    }

    const lastSyncText = subscription?.lastSyncAt
        ? formatLastSyncAt(subscription.lastSyncAt, t)
        : t("panel.sheetSubscription.neverSync");

    // 用显式映射而不是拼 key：i18n 的 key 是字面量联合类型，
    // 模板字符串拼出来的类型过不了类型检查
    const statusKeyMap = {
        success: "panel.sheetSubscription.status.success",
        partial: "panel.sheetSubscription.status.partial",
        failed: "panel.sheetSubscription.status.failed",
    } as const;
    const statusText = subscription?.lastSyncStatus
        ? t(statusKeyMap[subscription.lastSyncStatus])
        : "";

    return (
        <PanelBase
            height={vmax(70)}
            renderBody={() => (
                <>
                    <PanelHeader
                        hideButtons
                        title={t("panel.sheetSubscription.title")}
                    />
                    <ScrollView
                        style={[
                            style.body,
                            { marginBottom: safeAreaInsets.bottom },
                        ]}>
                        {/* 来源 */}
                        <ListItem
                            withHorizontalPadding
                            onPress={() => {
                                showDialog("SimpleDialog", {
                                    title: t("panel.sheetSubscription.source"),
                                    content: subscription?.url ?? "",
                                });
                            }}>
                            <ListItem.Content
                                title={t("panel.sheetSubscription.source")}
                                description={subscription?.url}
                            />
                        </ListItem>

                        {/* 上次同步 */}
                        <ListItem withHorizontalPadding>
                            <ListItem.Content
                                title={t("panel.sheetSubscription.lastSync")}
                                description={
                                    statusText
                                        ? `${lastSyncText} · ${statusText}`
                                        : lastSyncText
                                }
                            />
                        </ListItem>

                        {/* 立即同步 */}
                        <ListItem
                            withHorizontalPadding
                            onPress={async () => {
                                Toast.success(t("panel.sheetSubscription.syncing"));
                                const result = await syncSheet(sheetId);
                                if (result.status === "failed") {
                                    Toast.warn(
                                        t("panel.sheetSubscription.syncFailed", {
                                            error: result.error ?? "",
                                        }),
                                    );
                                    return;
                                }
                                const added = result.added.length;
                                const missing = result.missing.length;
                                if (added > 0) {
                                    Toast.success(
                                        t("panel.sheetSubscription.addedSongs", {
                                            count: added,
                                        }),
                                    );
                                } else {
                                    Toast.success(
                                        t("panel.sheetSubscription.upToDate"),
                                    );
                                }
                                if (missing > 0) {
                                    showDialog("SimpleDialog", {
                                        title: t(
                                            "panel.sheetSubscription.missingTitle",
                                        ),
                                        content: t(
                                            "panel.sheetSubscription.missingContent",
                                            { count: missing },
                                        ),
                                    });
                                }
                            }}>
                            <ListItem.Content
                                title={t("panel.sheetSubscription.syncNow")}
                                description={t(
                                    "panel.sheetSubscription.syncNowDesc",
                                )}
                            />
                        </ListItem>

                        {/* 自动同步 */}
                        <ListItem withHorizontalPadding>
                            <ListItem.Content
                                title={t("panel.sheetSubscription.autoSync")}
                                description={t(
                                    "panel.sheetSubscription.autoSyncDesc",
                                )}
                            />
                            <ThemeSwitch
                                value={!!subscription?.autoSync}
                                onValueChange={async value => {
                                    await MusicSheet.updateMusicSheetBase(sheetId, {
                                        subscription: {
                                            ...(subscription as IMusic.ISubscription),
                                            autoSync: value,
                                        },
                                    });
                                }}
                            />
                        </ListItem>

                        {/* 同步模式 */}
                        <ListItem
                            withHorizontalPadding
                            onPress={() => {
                                showDialog("RadioDialog", {
                                    title: t("panel.sheetSubscription.syncMode"),
                                    content: [
                                        {
                                            value: "append",
                                            label: t(
                                                "panel.sheetSubscription.syncMode.append",
                                            ),
                                        },
                                        {
                                            value: "mirror",
                                            label: t(
                                                "panel.sheetSubscription.syncMode.mirror",
                                            ),
                                        },
                                    ],
                                    async onOk(value: "append" | "mirror") {
                                        await MusicSheet.updateMusicSheetBase(
                                            sheetId,
                                            {
                                                subscription: {
                                                    ...(subscription as IMusic.ISubscription),
                                                    syncMode: value,
                                                },
                                            },
                                        );
                                    },
                                });
                            }}>
                            <ListItem.Content
                                title={t("panel.sheetSubscription.syncMode")}
                                description={t(
                                    (subscription?.syncMode ?? "append") ===
                                        "mirror"
                                        ? "panel.sheetSubscription.syncMode.mirror"
                                        : "panel.sheetSubscription.syncMode.append",
                                )}
                            />
                        </ListItem>

                        {/* 更换来源链接 */}
                        <ListItem
                            withHorizontalPadding
                            onPress={() => {
                                showDialog("SimpleInputDialog", {
                                    title: t("panel.sheetSubscription.changeUrl"),
                                    placeholder: subscription?.url ?? "",
                                    async onOk(url: string) {
                                        if (!url) {
                                            return;
                                        }
                                        await subscribeSheet(
                                            sheetId,
                                            url,
                                            subscription!.platform,
                                        );
                                        Toast.success(
                                            t("panel.sheetSubscription.urlUpdated"),
                                        );
                                    },
                                });
                            }}>
                            <ListItem.Content
                                title={t("panel.sheetSubscription.changeUrl")}
                                description={t(
                                    "panel.sheetSubscription.changeUrlDesc",
                                )}
                            />
                        </ListItem>

                        {/* 解除订阅 */}
                        <ListItem
                            withHorizontalPadding
                            onPress={() => {
                                showDialog("SimpleDialog", {
                                    title: t("panel.sheetSubscription.unsubscribe"),
                                    content: t(
                                        "panel.sheetSubscription.unsubscribeConfirm",
                                    ),
                                    async onOk() {
                                        await unsubscribeSheet(sheetId);
                                        hidePanel();
                                        Toast.success(
                                            t(
                                                "panel.sheetSubscription.unsubscribed",
                                            ),
                                        );
                                    },
                                });
                            }}>
                            <ListItem.Content
                                title={t("panel.sheetSubscription.unsubscribe")}
                                description={t(
                                    "panel.sheetSubscription.unsubscribeDesc",
                                )}
                            />
                        </ListItem>
                    </ScrollView>
                </>
            )}
        />
    );
}

const style = StyleSheet.create({
    body: {
        flex: 1,
        paddingHorizontal: rpx(24),
    },
});
