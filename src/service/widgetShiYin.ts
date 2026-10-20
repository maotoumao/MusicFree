import i18n from "@/core/i18n";
import musicHistory from "@/core/musicHistory";
import PluginManager from "@/core/pluginManager";
import { buildShiYinQueue, getPrimaryArtist, SHIYIN_QUEUE_SIZE } from "@/core/randomPlay";
import TrackPlayer from "@/core/trackPlayer";
import { ToastAndroid } from "react-native";

/** Desktop entry using the chart pool, history weighting and existing player 拾音. */
export async function startWidgetShiYin(canPlay?: () => Promise<boolean>) {
    const plugins = PluginManager.getSortedPluginsWithAbility("getTopLists");
    if (!plugins.length) {
        ToastAndroid.show(i18n.t("toast.shiyinNoSource"), ToastAndroid.LONG);
        return;
    }
    try {
        const history = musicHistory.history;
        const result = await buildShiYinQueue({
            plugins,
            excludeMusicItems: [...history.slice(0, 10), ...TrackPlayer.playList],
            preferredArtists: Array.from(new Set(history.slice(0, 40).map(item => getPrimaryArtist(item.artist)).filter(Boolean))),
            queueSize: SHIYIN_QUEUE_SIZE,
        });
        if (!result.musicList.length) {
            ToastAndroid.show(i18n.t(result.poolSize ? "toast.shiyinNoMusic" : "toast.shiyinPoolEmpty"), ToastAndroid.LONG);
            return;
        }
        if (canPlay && !await canPlay()) return;
        await TrackPlayer.playWithReplacePlayList(result.musicList[0], result.musicList);
        ToastAndroid.show(i18n.t("toast.shiyinStarted", { count: result.musicList.length }), ToastAndroid.LONG);
    } catch {
        ToastAndroid.show(i18n.t("toast.shiyinNoMusic"), ToastAndroid.LONG);
    }
}
