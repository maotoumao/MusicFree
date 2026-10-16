import PluginManager, { Plugin } from "../pluginManager";
import { hash } from "react-native-fs";
import getOrCreateMMKV from "@/utils/getOrCreateMMKV";
import { SourceOverride, SourceProfile, sourceProfile, SourceTier } from "./selection";

const storage = getOrCreateMMKV("source.policy.v1");
const digests = new WeakMap<Plugin, Promise<string>>();
export async function profileFor(plugin: Plugin): Promise<SourceProfile> {
    let digest = digests.get(plugin);
    if (!digest) {
        digest = hash(plugin.path, "sha256").catch(() => plugin.hash);
        digests.set(plugin, digest);
    }
    const sourceId = await digest;
    let override: SourceOverride = {};
    try {
        override = JSON.parse(storage.getString(sourceId) ?? "null") ?? {};
    } catch { /* Use the installed source order. */ }
    if (!["preferred", "backup", "disabled"].includes(override.tier ?? "preferred")) override.tier = "preferred";
    return sourceProfile(sourceId, plugin.name, [], { ...override, tier: override.tier ?? "preferred" });
}
export async function setSourceTier(plugin: Plugin, tier: SourceTier) {
    const profile = await profileFor(plugin);
    storage.set(profile.sourceId, JSON.stringify({ tier, verifiedOnAndroid: profile.verifiedOnAndroid }));
}
export async function markAndroidPlaybackVerified(plugin: Plugin) {
    const profile = await profileFor(plugin);
    storage.set(profile.sourceId, JSON.stringify({ tier: profile.tier, verifiedOnAndroid: true }));
}
export async function selectedSources(tier: "preferred" | "backup"): Promise<Plugin[]> {
    const plugins = PluginManager.getSortedSearchablePlugins("music");
    const profiles = await Promise.all(plugins.map(profileFor));
    return plugins.filter((_, index) => profiles[index].tier === tier);
}
