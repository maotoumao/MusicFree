import { NativeModules, ToastAndroid } from "react-native";
import i18n from "@/core/i18n";
import { errorLog } from "@/utils/log";
import { initTrackPlayer } from "./playbackRuntime";
import { runMusicWidgetAction } from "./musicWidget";

type WidgetTask = { control?: string; request?: string };

/** Invoked by the foreground playback service without rendering the UI. */
export default async function runWidgetTask({ control, request }: WidgetTask) {
    try {
        if (!["toggle", "previous", "next", "shiyin"].includes(control ?? "")) return;
        await require("./index")();
        await initTrackPlayer(undefined, true);
        const isActive = request ? () => NativeModules.MusicWidget.isActionActive(request) : undefined;
        await runMusicWidgetAction(control!, isActive);
    } catch (error) {
        errorLog("Widget background startup failed", error);
        ToastAndroid.show(i18n.t("toast.widgetStartupFailed"), ToastAndroid.LONG);
    } finally {
        if (request) await NativeModules.MusicWidget?.finishAction(request)?.catch(() => undefined);
    }
}
