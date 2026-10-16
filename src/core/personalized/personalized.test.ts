import { describe, it, expect, jest } from "@jest/globals";
import { normalize, songKey, matchTarget, versionTags } from "../musicIdentity";
import { Cache } from "./cache";
import { LastfmClient } from "./lastfm";
import { RecommendationEngine } from "./engine";
import { Evidence, rankCandidates, selectSeeds } from "./ranking";
import { tryCandidates } from "../aggregateSearch/resolver";
import { sourceProfile, SourceProfile } from "../sourcePolicy/selection";

const song = (artist = "歌手", title = "歌曲") => ({ artist, title });
const track = (artist = "歌手", title = "歌曲", id = "1"): IMusic.IMusicItem => ({ ...song(artist, title), id, platform: "source", duration: 200, album: "", artwork: "" });
const seed = (id = "seed") => ({ ...song("艺人", id), key: id, weight: 1 });
const evidence = (artist: string, title: string, source: "direct" | "fallback" = "direct", id = "seed", rank = 1): Evidence => ({ artist, title, source, seed: seed(id), rank });
function memory() {
    const values = new Map<string, string>();
    return { getString: (key: string) => values.get(key), set: (key: string, value: string) => {
        values.set(key, value);
    } };
}

describe("music identity and safe resolver", () => {
    it("folds traditional, punctuation, whitespace, case and width", () => {
        expect(normalize("　周杰倫－ＡＢＣ ’ 夜 曲")).toBe(normalize("周杰伦abc夜曲"));
        expect(songKey(song("梁靜茹", "勇氣"))).toBe(songKey(song("梁静茹", "勇气")));
    });
    it("requires artist plus title and excludes short clips, covers and accompaniment", () => {
        expect(matchTarget(song(), track("别人"))).toBe(0);
        expect(matchTarget(song(), track("歌手", "其他歌"))).toBe(0);
        expect(matchTarget(song(), { ...track(), duration: 30 })).toBe(0);
        expect(matchTarget(song(), track("歌手", "歌曲 (Cover)"))).toBe(0);
        expect(matchTarget(song(), track("歌手", "歌曲 (伴奏)"))).toBe(0);
        expect(matchTarget(song(), track("歌手", "歌曲 (Live)"))).toBeLessThan(matchTarget(song(), track()));
        expect(matchTarget(song("歌手", "歌曲 (Live 2020)"), track("歌手", "歌曲 (Live 2021)"))).toBe(0);
        expect(versionTags("Alive")).toEqual([]);
    });
    it("tries studio first, isolates failure and never plays a wrong artist", async () => {
        const attempted: string[] = [];
        const candidates = [track("别人", "歌曲", "wrong"), track("歌手", "歌曲 (Live)", "live"), track("歌手", "歌曲", "studio")];
        const result = await tryCandidates(song(), candidates, async item => {
            attempted.push(item.id);
            if (item.id === "studio") throw new Error("bad URL");
            return true;
        });
        expect(attempted).toEqual(["studio", "live"]);
        expect(result?.id).toBe("live");
    });
    it("stops obsolete clicks before trying another source", async () => {
        let current = true;
        const attempt = jest.fn(async () => {
            current = false; return false;
        });
        await tryCandidates(song(), [track(), track("歌手", "歌曲", "2")], attempt, () => current);
        expect(attempt).toHaveBeenCalledTimes(1);
    });
});

describe("local profile and ranking", () => {
    it("prioritizes recent likes, deduplicates and caps seeds", () => {
        const likes = Array.from({ length: 60 }, (_, i) => song("歌手", `歌${i}`));
        const seeds = selectSeeds(likes, [likes[12], song("歌手", "新歌")]);
        expect(seeds).toHaveLength(40);
        expect(seeds[0].title).toBe("歌12");
        expect(seeds[0].weight).toBe(1.2);
        expect(new Set(seeds.map(s => s.key)).size).toBe(40);
    });
    it("hard filters normalized likes and softly penalizes recent plays", () => {
        const ranked = rankCandidates([evidence("周杰倫", "晴天"), evidence("甲", "新歌"), evidence("乙", "旧歌")], [song("周杰伦", "晴天")], [song("乙", "旧歌")]);
        expect(ranked).toHaveLength(2);
        expect(ranked[0].title).toBe("新歌");
    });
    it("direct beats weak fallback but multi-seed fallback can beat weak direct", () => {
        const single = rankCandidates([evidence("甲", "直接"), evidence("乙", "回退", "fallback")], [], []);
        expect(single[0].direct).toBe(true);
        const fused = rankCandidates([evidence("甲", "直接", "direct", "s", 50), ...Array.from({ length: 5 }, (_, i) => evidence("乙", "回退", "fallback", `${i}`))], [], []);
        expect(fused[0].title).toBe("回退");
        expect(fused[0].seedCount).toBe(5);
    });
    it("deduplicates evidence from retries and does not penalize merged name forms", () => {
        const original = evidence("周杰伦", "新歌");
        const ranked = rankCandidates([original, { ...original, artist: "周杰倫" }], [], []);
        expect(ranked).toHaveLength(1);
        expect(ranked[0].score).toBe(rankCandidates([original], [], [])[0].score);
    });
    it("penalizes special versions without imposing a language preference", () => {
        const normal = rankCandidates([evidence("甲", "新歌")], [], [])[0];
        const special = rankCandidates([evidence("甲", "新歌 (Live)")], [], [])[0];
        const english = rankCandidates([evidence("甲", "Melody")], [], [])[0];
        expect(special.score).toBeCloseTo(normal.score * 0.7);
        expect(english.score).toBeCloseTo(normal.score);
    });
    it("fills Top30 with at most two per artist and nine fallback-only songs when direct pool suffices", () => {
        const pool = Array.from({ length: 80 }, (_, i) => evidence(`艺人${Math.floor(i / 4)}`, `歌${i}`, i < 16 ? "fallback" : "direct"));
        const top = rankCandidates(pool, [], []).slice(0, 30);
        expect(top).toHaveLength(30);
        expect(top.filter(c => !c.direct).length).toBeLessThanOrEqual(9);
        for (const artist of new Set(top.map(c => c.artist))) expect(top.filter(c => c.artist === artist).length).toBeLessThanOrEqual(2);
    });
    it("relaxes fallback share when direct candidates are insufficient", () => {
        const ranked = rankCandidates(Array.from({ length: 30 }, (_, i) => evidence(`艺人${i}`, `歌${i}`, "fallback")), [], []);
        expect(ranked).toHaveLength(30);
    });
});

describe("Last.fm and persistent recommendation cache", () => {
    it("retries canonical spelling once then generates concrete fallback tracks", async () => {
        const calls: string[] = [];
        const client = new LastfmClient(async (method, params) => {
            calls.push(`${method}:${params.artist}`);
            if (method === "track.getSimilar") return { similartracks: { track: [] } };
            if (method === "track.getInfo") return { track: { name: "歌曲", artist: { name: "藝人" } } };
            if (method === "artist.getSimilar") return { similarartists: { artist: [{ name: "邻居" }] } };
            return { toptracks: { track: [{ name: "新歌", artist: { name: "邻居" } }] } };
        }, new Cache(memory(), "api"));
        const result = await client.candidates({ ...seed(), artist: "艺人", title: "歌曲" });
        expect(calls.filter(c => c.startsWith("track.getSimilar"))).toEqual(["track.getSimilar:艺人", "track.getSimilar:藝人"]);
        expect(result.evidence[0].source).toBe("fallback");
        expect(result.evidence[0].title).toBe("新歌");
    });
    it("shares requests, persists across client restart, bounds concurrency and reuses stale data offline", async () => {
        const storage = memory();
        let active = 0; let peak = 0;
        const transport = jest.fn(async () => {
            active++; peak = Math.max(peak, active);
            await new Promise<void>(resolve => setTimeout(resolve, 2));
            active--;
            return { similartracks: { track: [] } };
        });
        const client = new LastfmClient(transport, new Cache(storage, "api"));
        await Promise.all(Array.from({ length: 12 }, (_, i) => client.request("track.getSimilar", { artist: `a${i % 6}`, track: "song" })));
        expect(peak).toBeLessThanOrEqual(3);
        expect(transport).toHaveBeenCalledTimes(6);
        const offline = jest.fn(async () => {
            throw new Error("offline");
        });
        const restarted = new LastfmClient(offline, new Cache(storage, "api"));
        await restarted.request("track.getSimilar", { artist: "a0", track: "song" });
        expect(offline).not.toHaveBeenCalled();
        const now = jest.spyOn(Date, "now").mockReturnValue(Date.now() + 8 * 86400000);
        await expect(restarted.request("track.getSimilar", { artist: "a0", track: "song" })).resolves.toHaveProperty("similartracks");
        now.mockRestore();
    });
    it("keeps last successful snapshot on a full failure and filters new likes immediately", async () => {
        const storage = memory();
        const client = new LastfmClient(async method => method === "track.getSimilar" ? {
            similartracks: { track: Array.from({ length: 40 }, (_, i) => ({ name: `歌曲${i}`, artist: { name: `歌手${i}` } })) },
        } : {}, new Cache(storage, "api"));
        const engine = new RecommendationEngine(client, new Cache(storage, "results"));
        const first = await engine.generate([song()], []);
        expect(first.candidates.length).toBeGreaterThanOrEqual(30);
        const restarted = new RecommendationEngine(new LastfmClient(async () => {
            throw new Error("network");
        }, new Cache(memory(), "api")), new Cache(storage, "results"));
        await expect(restarted.generate([song()], [])).rejects.toThrow();
        expect(restarted.current([first.candidates[0]])?.candidates.length).toBe(first.candidates.length - 1);
    });
    it("handles API throttling as failure and never caches it as an empty success", async () => {
        const call = jest.fn(async () => ({ error: 29, message: "Rate limit" }));
        const client = new LastfmClient(call, new Cache(memory(), "api"));
        await expect(client.request("track.getSimilar", { artist: "a", track: "t" })).rejects.toThrow("推荐服务暂时不可用");
        await expect(client.request("track.getSimilar", { artist: "b", track: "t" })).rejects.toThrow();
        expect(call).toHaveBeenCalledTimes(1);
    });
});

describe("source policy", () => {
    const known: SourceProfile = { sourceId: "full-hash", displayName: "同名源", score: 0, tier: "disabled", verifiedOnAndroid: false, reason: "sample-failures" };
    it("does not bind by name or treat unscored as zero", () => {
        expect(sourceProfile("another-hash", "同名源", [known])).toMatchObject({ score: null, tier: "backup" });
        expect(sourceProfile("full-hash", "同名源", [known]).tier).toBe("disabled");
    });
    it("supports overrides and reconsiders old failure evidence", () => {
        expect(sourceProfile("full-hash", "同名源", [known], { tier: "preferred" }).tier).toBe("preferred");
        expect(sourceProfile("full-hash", "同名源", [known], undefined, true).tier).toBe("backup");
    });
    it("does not promote unverified conditional sources or known preview-only sources", () => {
        expect(sourceProfile("full-hash", "同名源", [{ ...known, requiresAndroidCheck: true }], { tier: "preferred" }).tier).toBe("backup");
        expect(sourceProfile("full-hash", "同名源", [{ ...known, previewOnly: true }], { tier: "preferred" }).tier).toBe("disabled");
    });
});
