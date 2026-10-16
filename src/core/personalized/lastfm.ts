import { songKey, SongIdentity } from "../musicIdentity";
import { Cache } from "./cache";
import { RecommendationConfig as config } from "./config";
import { Evidence, Seed } from "./ranking";

export type Method = "track.getSimilar" | "track.getInfo" | "artist.getSimilar" | "artist.getTopTracks";
export type Transport = (method: Method, params: Record<string, string | number>) => Promise<any>;
const list = (value: any): any[] => Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
const name = (value: any): string => typeof value === "string" ? value.trim() : typeof value?.name === "string" ? value.name.trim() : "";

/** The transport never logs requests/errors: URL query parameters contain a private key. */
export class LastfmClient {
    private active = 0;
    private waiting: Array<() => void> = [];
    private pending = new Map<string, Promise<any>>();
    private cooldownUntil = 0;
    private consecutiveFailures = 0;
    public failures = 0;
    constructor(private transport: Transport, private cache: Cache) {}

    request(method: Method, params: Record<string, string | number>): Promise<any> {
        // Last.fm splits simplified/traditional identities: keep their spelling here.
        // Cross-provider identity folding belongs to ranking, never to API retry keys.
        const spelling = (value: string | number | undefined) => String(value ?? "").normalize("NFKC").trim().toLowerCase();
        const key = JSON.stringify([method, spelling(params.artist), spelling(params.track), params.limit]);
        const cached = this.cache.read<any>(key, config.apiCacheMs);
        if (cached !== undefined) return Promise.resolve(cached);
        const existing = this.pending.get(key);
        if (existing) return existing;
        const work = this.fetch(method, params, key).finally(() => this.pending.delete(key));
        this.pending.set(key, work);
        return work;
    }
    private async fetch(method: Method, params: Record<string, string | number>, key: string) {
        await new Promise<void>(resolve => {
            const start = () => {
                this.active++; resolve();
            };
            if (this.active < config.apiConcurrency) start();
            else this.waiting.push(start);
        });
        try {
            if (Date.now() < this.cooldownUntil) throw new Error("cooldown");
            const data = await this.transport(method, { ...params, autocorrect: 1 });
            if (!data || typeof data !== "object" || data.error) {
                if ([29, 8, 11, 16].includes(Number(data?.error))) this.cooldownUntil = Date.now() + 60000;
                // Missing identities are a successful empty result, not an API outage.
                if (Number(data?.error) === 6) {
                    this.cache.write(key, {}); return {};
                }
                throw new Error("unavailable");
            }
            this.cache.write(key, data);
            this.consecutiveFailures = 0;
            return data;
        } catch {
            this.failures++;
            if (++this.consecutiveFailures >= 3) this.cooldownUntil = Date.now() + 60000;
            const stale = this.cache.read<any>(key);
            if (stale !== undefined) return stale;
            throw new Error("推荐服务暂时不可用");
        } finally {
            this.active--;
            this.waiting.shift()?.();
        }
    }
    async candidates(seed: Seed): Promise<{ evidence: Evidence[]; canonical?: SongIdentity }> {
        const evidence: Evidence[] = [];
        const add = (data: any, source: "direct" | "fallback", offset = 0) => {
            list(data).forEach((track, index) => {
                const title = name(track.name);
                const artist = name(track.artist);
                if (title && artist) evidence.push({ title, artist, seed, source, rank: offset + index + 1,
                    ...(Number.isFinite(Number(track.match)) ? { match: Number(track.match) } : {}) });
            });
        };
        const similar = async (song: SongIdentity) => {
            const data = await this.request("track.getSimilar", { artist: song.artist, track: song.title, limit: config.trackSimilarLimit });
            add(data.similartracks?.track, "direct");
        };
        await similar(seed).catch(() => undefined);
        let canonical: SongIdentity | undefined;
        if (evidence.length < config.fallbackThreshold) {
            try {
                const info = await this.request("track.getInfo", { artist: seed.artist, track: seed.title });
                const song = { artist: name(info.track?.artist), title: name(info.track?.name) };
                if (song.artist && song.title) {
                    canonical = song;
                    // API spelling may differ even if our dedup identity folds it.
                    if (song.artist !== seed.artist || song.title !== seed.title) await similar(song);
                }
            } catch { /* Canonical lookup is optional. */ }
        }
        if (new Set(evidence.map(songKey)).size < config.fallbackThreshold) {
            try {
                const data = await this.request("artist.getSimilar", { artist: canonical?.artist ?? seed.artist, limit: config.artistSimilarLimit });
                const artists = list(data.similarartists?.artist).slice(0, config.artistSimilarLimit);
                await Promise.all(artists.map(async (artist, index) => {
                    if (!name(artist)) return;
                    try {
                        const tracks = await this.request("artist.getTopTracks", { artist: name(artist), limit: config.artistTopTracksLimit });
                        add(tracks.toptracks?.track, "fallback", index * config.artistTopTracksLimit);
                    } catch { /* Isolate each fallback artist. */ }
                }));
            } catch { /* Isolate each seed. */ }
        }
        return { evidence, canonical };
    }
}
