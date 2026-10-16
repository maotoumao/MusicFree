import type { Plugin } from "../pluginManager";
import { getSourceHealthSummary } from "../sourceHealth";
import { selectedSources, profileFor } from "../sourcePolicy/runtime";
import { matchTarget, normalize, SongIdentity, versionTags, simplified } from "../musicIdentity";
import { AggregateTrack, mergeTracks } from "./model";
import { searchSourcePage } from "./search";
import { SearchConfig } from "./config";
import { RequestPriority } from "./requestQueue";

export type SearchMode = "PREFERRED_ONLY" | "PREFERRED_THEN_BACKUP" | "EXPANDED";
export { selectedSources };
export async function aggregatePage(plugins: Plugin[], query: string, page = 1,
    previous: AggregateTrack[] = [], isCurrent?: () => boolean, priority: RequestPriority = 1) {
    const pages = await searchSourcePage(plugins, query, page, "music", isCurrent, priority);
    // Preserve tier priority; offline coverage remains distinct from live health.
    const profiles = await Promise.all(plugins.map(profileFor));
    const byName = new Map(plugins.map((p, i) => [p.name, profiles[i]]));
    const incoming = pages.flatMap(({ plugin, result }) => (result?.data ?? []).map(track => ({
        ...(track as IMusic.IMusicItem), $sourcePluginId: plugin.hash, $sourceProfile: byName.get(plugin.name),
    }))) as IMusic.IMusicItem[];
    const data = mergeTracks(previous, incoming, getSourceHealthSummary,
        new Map(plugins.map((plugin, index) => [plugin.name, index])));
    data.forEach(group => {
        group.candidates.sort((a, b) => {
            const pa = a.$sourceProfile ?? byName.get(a.platform);
            const pb = b.$sourceProfile ?? byName.get(b.platform);
            const tier = (p: typeof pa) => p?.tier === "preferred" ? 0 : 1;
            return tier(pa) - tier(pb) || (pb?.score ?? 50) - (pa?.score ?? 50);
        });
        group.canonical = { ...group.canonical, ...group.candidates[0] };
    });
    const wantedVersion = versionTags(query);
    const score = (group: AggregateTrack) => {
        const track = group.canonical;
        const text = normalize(`${track.artist}${track.title}`);
        const q = normalize(query);
        const relevance = text === q || normalize(`${track.title}${track.artist}`) === q ? 10
            : text.includes(q) ? 5 : 0;
        return relevance - (!wantedVersion.length && versionTags(track.title).length ? 1 : 0)
            - (track.duration > 0 && track.duration <= 65 ? 3 : 0);
    };
    data.sort((a, b) => score(b) - score(a));
    return { data, pages };
}

/** Used by recommendations and aggregate rows. Tier 2 is lazy until playback fails. */
export async function searchTarget(target: SongIdentity, tier: "preferred" | "backup", isCurrent?: () => boolean, priority: RequestPriority = 2) {
    const plugins = await selectedSources(tier);
    return searchTargetSources(target, plugins, isCurrent, priority);
}
export async function searchTargetSources(target: SongIdentity, plugins: Plugin[], isCurrent?: () => boolean, priority: RequestPriority = 2) {
    const { data } = await aggregatePage(plugins, `${simplified(target.artist)} ${simplified(target.title)}`, 1, [], isCurrent, priority);
    const candidates = data.flatMap(g => g.candidates).filter(track => matchTarget(target, track) > 0);
    return candidates.sort((a, b) => matchTarget(target, b) - matchTarget(target, a))
        .slice(0, SearchConfig.maxCandidatesPerTier);
}

/** Lazily search bounded backup groups; later groups are reached only on failure. */
export async function* targetBatches(target: SongIdentity, tier: "preferred" | "backup", isCurrent: () => boolean = () => true, priority: RequestPriority = 2) {
    const plugins = await selectedSources(tier);
    for (let index = 0; index < plugins.length && isCurrent(); index += SearchConfig.concurrency) {
        let open = true;
        const current = () => open && isCurrent();
        // Yield each source as it finishes: one slow plugin must not hold back a
        // usable match from its peers. The shared queue still enforces the cap.
        const pending = new Map(plugins.slice(index, index + SearchConfig.concurrency).map((plugin, i) => [i,
            searchTargetSources(target, [plugin], current, priority)
                .then(candidates => ({ i, candidates }), () => ({ i, candidates: [] as IMusic.IMusicItem[] })),
        ]));
        try {
            while (pending.size && isCurrent()) {
                const { i, candidates } = await Promise.race(pending.values());
                pending.delete(i);
                if (candidates.length && isCurrent()) yield candidates;
            }
        } finally {
            open = false;
        }
    }
}
