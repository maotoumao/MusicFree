import { useCallback, useRef } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { AppState } from "react-native";
import Config from "../appConfig";
import Network from "@/utils/network";
import { SongIdentity, songKey } from "../musicIdentity";
import { warmRecommendations } from "../aggregateSearch/preloader";
import { usePlugins } from "../pluginManager";

export function usePreparedRecommendations(targets: SongIdentity[], onReady?: (target: SongIdentity, track: IMusic.IMusicItem) => void) {
    const plugins = usePlugins();
    const warmer = useRef<ReturnType<typeof warmRecommendations>>();
    const callback = useRef(onReady);
    callback.current = onReady;
    const visible = useRef<string[]>([]);
    // Metadata object identity changes during rendering; only restart for new songs.
    const signature = JSON.stringify(targets.map(t => [t.artist, t.title]));
    useFocusEffect(useCallback(() => {
        // Home can mount before bootstrap finishes loading plugins. Waiting here
        // also prevents a cold start from discarding valid persisted URL leases.
        if (!plugins.length) return;
        const songs = JSON.parse(signature).map(([artist, title]: string[]) => ({ artist, title }));
        const firstVisible = visible.current.length ? visible.current : songs.slice(0, 10).map(songKey);
        const job = warmRecommendations(songs,
            (target, track) => callback.current?.(target, track),
            () => AppState.currentState === "active" && !Network.isOffline &&
                (!Network.isCellular || !!Config.getConfig("basic.useCelluarNetworkPlay")), firstVisible);
        warmer.current = job;
        job.prioritize(firstVisible);
        const subscription = AppState.addEventListener("change", state => {
            if (state === "active") job.prioritize(visible.current);
        });
        return () => {
            subscription.remove(); job.stop(); warmer.current = undefined;
        };
    }, [signature, plugins]));
    return useCallback((keys: string[]) => {
        visible.current = keys;
        warmer.current?.prioritize(keys);
    }, []);
}
