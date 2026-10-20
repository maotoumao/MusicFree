import { NativeModules, Platform, ToastAndroid } from "react-native";
import NativePlayer, { Event, State } from "react-native-track-player";
import TrackPlayer from "@/core/trackPlayer";
import { TrackPlayerEvents } from "@/core.defination/trackPlayer";
import i18n from "@/core/i18n";
import { errorLog } from "@/utils/log";
import type { WidgetColors } from "@/utils/widgetColors";

const bridge = () => Platform.OS === "android" ? NativeModules.MusicWidget : undefined;
let installed = false;
let state: State = State.None;
let revision = 0;
let actions = Promise.resolve();

function publish() {
    const music = TrackPlayer.currentMusic;
    bridge()?.updatePlayback({
        title: music?.title ?? "",
        artist: music?.artist ?? "",
        artwork: typeof music?.artwork === "string" ? music.artwork : "",
        hasTrack: !!music,
        playing: !!music && state === State.Playing,
        loading: !!music && (state === State.Buffering || state === State.Loading),
    })?.catch(() => undefined);
}

/** The app owns queue order and plugin sources; native skip would bypass them. */
export function runMusicWidgetAction(action: string, isActive?: () => Promise<boolean>) {
    if (!["toggle", "previous", "next"].includes(action)) return Promise.resolve();
    actions = actions.then(async () => {
        if (isActive && !await isActive()) return;
        if (!TrackPlayer.currentMusic) {
            ToastAndroid.show(i18n.t("toast.widgetQueueEmpty"), ToastAndroid.LONG);
            return;
        }
        if (action === "previous") await TrackPlayer.skipToPrevious();
        else if (action === "next") await TrackPlayer.skipToNext();
        else if (await NativePlayer.getPlayWhenReady()) await TrackPlayer.pause();
        else await TrackPlayer.play();
    }).catch(error => {
        errorLog("Music widget action failed", error);
        ToastAndroid.show(i18n.t("toast.widgetActionFailed"), ToastAndroid.LONG);
    });
    return actions;
}

/** Keep listeners with the player, rather than with a mounted screen. */
export function setupMusicWidget() {
    if (!bridge() || installed) return;
    installed = true;
    TrackPlayer.on(TrackPlayerEvents.CurrentMusicChanged, () => {
        revision++;
        state = State.Paused;
        publish();
    });
    NativePlayer.addEventListener(Event.PlaybackState, event => {
        revision++;
        state = event.state;
        publish();
    });
    NativePlayer.addEventListener(Event.PlaybackActiveTrackChanged, publish);
    const initialRevision = revision;
    NativePlayer.getPlaybackState().then(snapshot => {
        if (revision !== initialRevision) return;
        state = snapshot.state;
        publish();
    }).catch(() => publish());
    bridge().setReady(true)?.catch(() => undefined);
}

export function syncMusicWidgetColors(colors: WidgetColors) {
    bridge()?.updateColors(colors)?.catch(() => undefined);
}
