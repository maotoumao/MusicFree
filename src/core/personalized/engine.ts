import { SongIdentity, songKey } from "../musicIdentity";
import { Cache } from "./cache";
import { RecommendationConfig as config } from "./config";
import { LastfmClient } from "./lastfm";
import { Candidate, rankCandidates, selectSeeds } from "./ranking";

export interface Snapshot { at: number; profile: string[]; candidates: Candidate[]; partial: boolean }
export class RecommendationEngine {
    private pending?: Promise<Snapshot>;
    constructor(private client: LastfmClient, private cache: Cache) {}
    current(liked: SongIdentity[]): Snapshot | undefined {
        const snapshot = this.cache.read<Snapshot>("latest");
        if (!snapshot || !Array.isArray(snapshot.candidates) || !Array.isArray(snapshot.profile) || !Number.isFinite(snapshot.at)) return undefined;
        const excluded = new Set(liked.map(songKey));
        return { ...snapshot, candidates: snapshot.candidates.filter(c => c && typeof c.key === "string" &&
            typeof c.artist === "string" && typeof c.title === "string" && !excluded.has(songKey(c))) };
    }
    needsRefresh(liked: SongIdentity[], history: SongIdentity[]): boolean {
        const old = this.current(liked);
        if (!old || Date.now() - old.at >= config.resultCacheMs) return true;
        const profile = selectSeeds(liked, history).map(s => s.key);
        const common = profile.filter(key => old.profile.includes(key)).length;
        return common / Math.max(profile.length, old.profile.length, 1) < config.profileOverlap;
    }
    generate(liked: SongIdentity[], history: SongIdentity[]): Promise<Snapshot> {
        if (this.pending) return this.pending;
        this.pending = this.run(liked, history).finally(() => {
            this.pending = undefined;
        });
        return this.pending;
    }
    private async run(liked: SongIdentity[], history: SongIdentity[]): Promise<Snapshot> {
        const seeds = selectSeeds(liked, history);
        if (!seeds.length) throw new Error("先收藏或播放一些喜欢的歌曲，再来看看吧");
        const before = this.client.failures;
        // Seed workers limit pending work as well as HTTP concurrency.
        const results: Awaited<ReturnType<LastfmClient["candidates"]>>[] = [];
        let cursor = 0;
        await Promise.all(Array.from({ length: config.apiConcurrency }, async () => {
            while (cursor < seeds.length) {
                const index = cursor++;
                results[index] = await this.client.candidates(seeds[index]);
            }
        }));
        const likedKeys = new Set(liked.map(songKey));
        const canonicalLikes = results.flatMap((r, i) => r.canonical && likedKeys.has(seeds[i].key) ? [r.canonical] : []);
        const candidates = rankCandidates(results.flatMap(r => r.evidence), [...liked, ...canonicalLikes], history);
        if (!candidates.length) throw new Error("暂时没有找到合适的推荐，请稍后再试");
        const snapshot: Snapshot = { at: Date.now(), profile: seeds.map(s => s.key), candidates, partial: this.client.failures > before };
        const previous = this.current(liked);
        // Do not replace a useful cached batch with a fragment during an outage.
        if (snapshot.partial && previous && candidates.length < Math.min(30, previous.candidates.length)) return previous;
        this.cache.write("latest", snapshot);
        return snapshot;
    }
}
