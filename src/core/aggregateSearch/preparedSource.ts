import { Cache } from "./cache";
import { SearchConfig } from "./config";
import { SongIdentity, songKey, versionTags, normalize } from "../musicIdentity";

export function preparedTargetKey(target: SongIdentity) {
    return JSON.stringify([songKey(target), versionTags(target.title).length ? normalize(target.title) : ""]);
}

export interface PreparedSource {
    track: IMusic.IMusicItem;
    source: IPlugin.IMediaSourceResult;
    sourceId: string;
    expiresAt: number;
}

/** Short, conservative URL leases. Do not put these URLs into favorites/history. */
export function sourceExpiresAt(url: string, now = Date.now()) {
    let expiresAt = now + SearchConfig.preparedSourceMs;
    const query = url.split("?")[1]?.split("#")[0] ?? "";
    for (const pair of query.split("&")) {
        const [rawKey, rawValue] = pair.split("=");
        const key = rawKey.toLowerCase();
        if (!/^(expires|expire|expiry|expiration|deadline|wstime|txtime)$/.test(key)) continue;
        const value = /^(wstime|txtime)$/.test(key) ? parseInt(rawValue, 16) : Number(rawValue);
        if (!Number.isFinite(value) || value < 1000000000) continue;
        const timestamp = value < 100000000000 ? value * 1000 : value;
        expiresAt = Math.min(expiresAt, timestamp - 15000);
    }
    return expiresAt;
}

export class PreparedSourceCache {
    constructor(private cache: Cache) {}
    get(key: string, margin = 0): PreparedSource | undefined {
        const value = this.cache.read<PreparedSource>(key);
        if (!value?.source?.url || !value.track || !Number.isFinite(value.expiresAt)) return;
        if (value.expiresAt <= Date.now()) {
            this.remove(key);
            return;
        }
        return value.expiresAt > Date.now() + margin ? value : undefined;
    }
    set(key: string, track: IMusic.IMusicItem, source: IPlugin.IMediaSourceResult, sourceId: string) {
        if (!source.url) return;
        const value = { track, source: { ...source, headers: source.headers ? { ...source.headers } : undefined },
            sourceId, expiresAt: sourceExpiresAt(source.url) };
        if (value.expiresAt > Date.now()) this.cache.write(key, value);
        return value;
    }
    remove(key: string) {
        this.cache.write(key, null);
    }
}
