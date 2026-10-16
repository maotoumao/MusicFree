import { NativeModules } from "react-native";

// Debug builds only. Fixed event names and durations; no songs, URLs or headers.
export function playbackMetric(event: string, started = Date.now()) {
    NativeModules.NativeUtils?.recordPlaybackMetric?.(event, Date.now() - started);
}
