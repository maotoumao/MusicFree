import { describe, expect, it, jest, afterEach } from "@jest/globals";
import { PreparedSourceCache, sourceExpiresAt } from "./preparedSource";
import { Cache } from "./cache";
import { SearchConfig } from "./config";

afterEach(() => {
    jest.restoreAllMocks();
});
describe("prepared playback URL leases", () => {
    it("limits unsigned URLs and shortens leases for signed URL expirations", () => {
        const now = 1790000000000;
        expect(sourceExpiresAt("https://audio.invalid/a", now)).toBe(now + SearchConfig.preparedSourceMs);
        expect(sourceExpiresAt(`https://audio.invalid/a?expires=${now / 1000 + 60}`, now)).toBe(now + 45000);
        expect(sourceExpiresAt(`https://audio.invalid/a?wsTime=${(now / 1000 + 90).toString(16)}`, now)).toBe(now + 75000);
        expect(sourceExpiresAt(`https://audio.invalid/a?deadline=${now / 1000 - 60}`, now)).toBeLessThan(now);
    });
    it("survives recreation, retains request headers, and removes expired URLs", () => {
        let now = 1790000000000;
        jest.spyOn(Date, "now").mockImplementation(() => now);
        const values = new Map<string, string>();
        const storage = { getString: (k: string) => values.get(k), set: (k: string, v: string) => {
            values.set(k, v);
        } };
        const cache = new PreparedSourceCache(new Cache(storage, "links"));
        cache.set("song", { id: "1", platform: "test" } as IMusic.IMusicItem,
            { url: "https://audio.invalid/a", headers: { Referer: "https://music.invalid" } }, "sha256");
        const restarted = new PreparedSourceCache(new Cache(storage, "links"));
        expect(restarted.get("song")?.source.headers?.Referer).toBe("https://music.invalid");
        now += SearchConfig.preparedSourceMs - 30000;
        expect(restarted.get("song", 60000)).toBeUndefined();
        expect(restarted.get("song")).toBeDefined();
        now += 30001;
        expect(restarted.get("song")).toBeUndefined();
    });
});
