import axios from "axios";
import Config from "../appConfig";
import Network from "@/utils/network";
import MusicSheet from "../musicSheet";
import MusicHistory from "../musicHistory";
import getOrCreateMMKV from "@/utils/getOrCreateMMKV";
import { Cache } from "./cache";
import { LastfmClient } from "./lastfm";
import { RecommendationEngine } from "./engine";
import { RecommendationConfig as config } from "./config";
import { RecommendationSettings } from "./settings";

const storage = getOrCreateMMKV("personalized.v1");
export const recommendationSettings = new RecommendationSettings(getOrCreateMMKV("personalized.settings.v1"));
const controllers = new Set<AbortController>();
let revision = 0;
const http = axios.create({ timeout: config.apiTimeoutMs });
function createEngine() {
    const generation = revision;
    const guardedStorage = {
        getString: (key: string) => generation === revision ? storage.getString(key) : undefined,
        set: (key: string, value: string) => {
            if (generation === revision) storage.set(key, value);
        },
        delete: (key: string) => {
            if (generation === revision) storage.delete(key);
        },
    };
    const client = new LastfmClient(async (method, params) => {
        const settings = recommendationSettings.read();
        if (!settings.enabled || generation !== revision || Network.isOffline ||
            (Network.isCellular && !Config.getConfig("basic.useCelluarNetworkPlay"))) {
            throw new Error("Recommendation service unavailable");
        }
        const controller = new AbortController();
        controllers.add(controller);
        try {
            const response = await http.get("https://ws.audioscrobbler.com/2.0/", {
                params: { ...params, method, api_key: settings.apiKey, format: "json" },
                signal: controller.signal,
            });
            if (generation !== revision) throw new Error("Configuration changed");
            return response.data;
        } catch {
            // Never propagate Axios errors: they retain the request URL and key.
            throw new Error("Recommendation service unavailable");
        } finally {
            controllers.delete(controller);
        }
    }, new Cache(guardedStorage, "lastfm"));
    return new RecommendationEngine(client, new Cache(guardedStorage, "results", 2));
}
export let recommendations = createEngine();
export function configureRecommendations(apiKey?: string) {
    if (apiKey === undefined) recommendationSettings.disable();
    else recommendationSettings.enable(apiKey);
    revision++;
    controllers.forEach(controller => controller.abort());
    controllers.clear();
    storage.clearAll();
    recommendations = createEngine();
}
export function localProfile() {
    return {
        liked: MusicSheet.getSortedMusicListBySheetId("favorite").musicList,
        history: MusicHistory.history,
    };
}
