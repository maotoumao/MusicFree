import { baseTitle, normalize, songKey, versionTags, SongIdentity } from "../musicIdentity";
import { RecommendationConfig as config } from "./config";

export interface Seed extends SongIdentity { key: string; weight: number }
export interface Evidence extends SongIdentity {
    seed: Seed; rank: number; source: "direct" | "fallback"; match?: number;
}
export interface Candidate extends SongIdentity {
    key: string; score: number; seedCount: number; direct: boolean; evidence: Evidence[];
}

export function selectSeeds(liked: SongIdentity[], history: SongIdentity[]): Seed[] {
    const likes = new Set(liked.map(songKey));
    const recent = new Set(history.slice(0, config.recentWindow).map(songKey));
    const map = new Map<string, Seed>();
    const ordered = [...history.filter(s => likes.has(songKey(s))), ...liked, ...history];
    for (const song of ordered) {
        const key = songKey(song);
        if (!normalize(song.artist) || !baseTitle(song.title) || map.has(key)) continue;
        map.set(key, { artist: song.artist, title: song.title, key,
            weight: likes.has(key) ? (recent.has(key) ? config.likedRecentWeight : config.likedWeight) : config.recentWeight });
        if (map.size === config.maxSeeds) break;
    }
    return [...map.values()];
}

export function rankCandidates(evidence: Evidence[], liked: SongIdentity[], history: SongIdentity[]): Candidate[] {
    const excluded = new Set(liked.map(songKey));
    const recent = new Set(history.slice(0, config.recentWindow).map(songKey));
    const groups = new Map<string, Candidate>();
    for (const item of evidence) {
        const key = songKey(item);
        if (excluded.has(key) || !normalize(item.artist) || !baseTitle(item.title)) continue;
        // Keep distinct special versions in the pool, but exclude liked identities across versions.
        const versionKey = JSON.stringify([key, versionTags(item.title), versionTags(item.title).length ? normalize(item.title) : ""]);
        const group = groups.get(versionKey) ?? { artist: item.artist, title: item.title, key: versionKey, score: 0, seedCount: 0, direct: false, evidence: [] };
        const old = group.evidence.findIndex(e => e.seed.key === item.seed.key && e.source === item.source);
        if (old < 0) group.evidence.push(item);
        else if (item.rank < group.evidence[old].rank) group.evidence[old] = item;
        groups.set(versionKey, group);
    }
    for (const group of groups.values()) {
        group.seedCount = new Set(group.evidence.map(e => e.seed.key)).size;
        group.direct = group.evidence.some(e => e.source === "direct");
        group.score = group.evidence.reduce((score, e) => score + e.seed.weight *
            (e.source === "direct" ? config.directWeight : config.fallbackWeight) / (config.rankK + e.rank), 0);
        group.score *= 1 + config.multiSeedBonusAlpha * Math.log2(group.seedCount + 1);
        if (versionTags(group.title).length) group.score *= config.specialVersionPenalty;
        // Script is a conservative proxy, never an inferred artist nationality.
        if (/\p{Script=Han}/u.test(group.artist) && !/\p{Script=Han}/u.test(group.title)) group.score *= config.nonHanTitlePreferencePenalty;
        if (recent.has(songKey(group))) group.score *= config.recentPenalty;
    }
    const sorted = [...groups.values()].sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
    const result: Candidate[] = [];
    while (result.length < config.poolSize) {
        const batch = selectBatch(sorted.filter(c => !result.includes(c)), config.batchSize);
        if (!batch.length) break;
        result.push(...batch.slice(0, config.poolSize - result.length));
    }
    return result;
}

export function selectBatch(pool: Candidate[], size: number = config.batchSize): Candidate[] {
    const result: Candidate[] = [];
    const artists = new Map<string, number>();
    let fallbackCount = 0;
    const add = (cap: number, fallbackCap: number) => {
        for (const song of pool) {
            if (result.length >= size) break;
            const artist = normalize(song.artist);
            if (result.includes(song) || (artists.get(artist) ?? 0) >= cap || (!song.direct && fallbackCount >= fallbackCap)) continue;
            result.push(song);
            artists.set(artist, (artists.get(artist) ?? 0) + 1);
            if (!song.direct) fallbackCount++;
        }
    };
    add(config.artistCap, config.fallbackOnlyCap);
    add(config.relaxedArtistCap, config.fallbackOnlyCap);
    // Only relax fallback proportion when usable direct candidates cannot fill the batch.
    add(config.relaxedArtistCap, size);
    return result;
}
