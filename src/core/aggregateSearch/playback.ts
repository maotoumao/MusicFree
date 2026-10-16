import Player from "../trackPlayer";
import NativePlayer, { State } from "react-native-track-player";
import PluginManager, { Plugin } from "../pluginManager";
import getOrCreateMMKV from "@/utils/getOrCreateMMKV";
import Toast from "@/utils/toast";
import { Cache } from "./cache";
import { SongIdentity, matchTarget } from "../musicIdentity";
import { targetBatches } from "./service";
import { SearchConfig, withTimeout } from "./config";
import { tryCandidates } from "./resolver";
import { profileFor, markAndroidPlaybackVerified } from "../sourcePolicy/runtime";
import { scheduleMusicSearch, reprioritizeMusicRequests, RequestPriority } from "./requestQueue";
import { PreparedSource, PreparedSourceCache, preparedTargetKey as resolvedKey } from "./preparedSource";
import { playbackMetric } from "./metrics";

const cache = new Cache(getOrCreateMMKV("resolved.tracks.v1"), "identity", 200);
const preparedCache = new PreparedSourceCache(new Cache(getOrCreateMMKV("prepared.playback.v1", true), "links", 100));
interface Resolved { track: IMusic.IMusicItem; sourceId: string }
function resolveSource(plugin: Plugin, track: IMusic.IMusicItem, current: () => boolean, priority: RequestPriority = 2) {
    const deadline = Date.now() + SearchConfig.resolverTimeoutMs;
    return withTimeout(scheduleMusicSearch(() => plugin.resolveAutomaticMediaSource(track),
        () => current() && Date.now() < deadline, priority), SearchConfig.resolverTimeoutMs);
}
function pluginFor(track: IMusic.IMusicItem) {
    return track.$sourcePluginId ? PluginManager.getByHash(track.$sourcePluginId) : PluginManager.getByName(track.platform);
}
function identityOnly(track: IMusic.IMusicItem): IMusic.IMusicItem {
    const result = { ...track };
    delete result.url;
    delete result.source;
    delete result.headers;
    delete result.userAgent;
    if (result.qualities) {
        result.qualities = Object.fromEntries(Object.entries(result.qualities).map(([quality, data]) => [quality, { size: data.size }])) as IMusic.IQuality;
    }
    return result;
}
async function saved(target: SongIdentity): Promise<IMusic.IMusicItem | undefined> {
    const value = cache.read<Resolved>(resolvedKey(target), SearchConfig.resolvedCacheMs);
    if (!value || !matchTarget(target, value.track)) return;
    const plugin = pluginFor(value.track);
    if (!plugin || !PluginManager.getSearchablePlugins("music").includes(plugin)) return;
    const profile = await profileFor(plugin);
    if (profile.sourceId === value.sourceId && profile.tier !== "disabled") return value.track;
}
async function remember(target: SongIdentity, track: IMusic.IMusicItem) {
    const plugin = pluginFor(track);
    if (plugin) cache.write(resolvedKey(target), { track: identityOnly(track), sourceId: (await profileFor(plugin)).sourceId });
}
async function readySource(target: SongIdentity, margin = 0) {
    const key = resolvedKey(target);
    const value = preparedCache.get(key, margin);
    if (!value || !matchTarget(target, value.track)) return;
    const plugin = pluginFor(value.track);
    if (plugin && PluginManager.getSearchablePlugins("music").includes(plugin)) {
        const profile = await profileFor(plugin);
        if (profile.sourceId === value.sourceId && profile.tier !== "disabled") return value;
    }
    preparedCache.remove(key);
}

type PreparedResult = PreparedSource & { reused: boolean };
interface Preparation {
    consumers: Array<{ current: () => boolean; priority: number }>;
    allowBackup: boolean;
    promise: Promise<PreparedResult | undefined>;
}
const preparing = new Map<string, Preparation>();

/** Join an existing warmup, upgrading queued requests when the user taps it. */
export async function prepareTarget(target: SongIdentity, current: () => boolean = () => true,
    priority = 2, allowBackup = true, initial: IMusic.IMusicItem[] = []): Promise<PreparedResult | undefined> {
    const started = Date.now();
    const ready = await readySource(target, priority === 0 ? SearchConfig.preparedRefreshAheadMs : 0);
    if (!current()) return;
    if (ready) {
        playbackMetric(priority ? "click-cache-hit" : "warm-cache-hit", started);
        return { ...ready, reused: true };
    }
    const key = resolvedKey(target);
    const consumer = { current, priority };
    const pending = preparing.get(key);
    if (pending) {
        pending.consumers.push(consumer);
        pending.allowBackup ||= allowBackup;
        reprioritizeMusicRequests();
        const result = await pending.promise;
        return current() ? result : undefined;
    }
    const job: Preparation = { consumers: [consumer], allowBackup, promise: Promise.resolve(undefined) };
    playbackMetric(priority ? "click-prepare-start" : "warm-prepare-start");
    const deadline = Date.now() + SearchConfig.backgroundPrepareMs;
    const liveConsumers = () => job.consumers.filter(c => c.current() && (c.priority > 0 || Date.now() < deadline));
    const active = () => liveConsumers().length > 0;
    const importance = () => Math.max(0, ...liveConsumers().map(c => c.priority));
    preparing.set(key, job);
    job.promise = (async () => {
        const attempted = new Set<string>();
        const attempt = async (tracks: IMusic.IMusicItem[]) => {
            let prepared: PreparedResult | undefined;
            await tryCandidates(target, tracks, async track => {
                const id = JSON.stringify([track.platform, track.id]);
                if (attempted.has(id)) return false;
                attempted.add(id);
                const plugin = pluginFor(track);
                if (!plugin || !PluginManager.getSearchablePlugins("music").includes(plugin)) return false;
                const profile = await profileFor(plugin);
                if (profile.tier === "disabled" || !active()) return false;
                const source = await resolveSource(plugin, track, active, importance);
                if (!source?.url || !active()) return false;
                const identity = identityOnly({ ...track, $autoResolveTarget: { artist: target.artist, title: target.title } });
                const value = preparedCache.set(key, identity, source, profile.sourceId);
                if (!value || value.expiresAt <= Date.now()) return false;
                await remember(target, identity);
                prepared = { ...value, reused: false };
                return true;
            }, active);
            return prepared;
        };
        const identity = await saved(target);
        const existing = await attempt(identity ? [identity, ...initial] : initial);
        if (existing) return existing;
        for (const tier of ["preferred", "backup"] as const) {
            if (!active() || (tier === "backup" && !job.allowBackup)) break;
            for await (const candidates of targetBatches(target, tier, active, importance)) {
                const result = await attempt(candidates);
                if (result) return result;
            }
        }
    })().finally(() => {
        if (preparing.get(key) === job) preparing.delete(key);
    });
    const result = await job.promise;
    playbackMetric(`${priority ? "click" : "warm"}-${result ? "ready" : "miss"}`, started);
    return current() ? result : undefined;
}

export async function resolveIdentity(target: SongIdentity, current: () => boolean = () => true, priority = 2) {
    return (await prepareTarget(target, current, priority))?.track;
}

export async function playTarget(target: SongIdentity, initial: IMusic.IMusicItem[] = []): Promise<IMusic.IMusicItem | undefined> {
    const clicked = Date.now();
    const revision = Player.beginManagedPlayback();
    const current = () => Player.isManagedPlaybackCurrent(revision);
    const prepared = await prepareTarget(target, current, 2, true, initial);
    if (!current()) return;
    if (!prepared) {
        Toast.warn("暂时找不到可播放音源");
        return;
    }
    const attempted = new Set<string>();
    let errorDuringStart = false;
    let busy = false;
    const preferred = targetBatches(target, "preferred", current);
    const backup = targetBatches(target, "backup", current);
    let preferredEnded = false;
    let backupEnded = false;
    let candidates = [prepared.track, ...initial];
    const advance = async (): Promise<IMusic.IMusicItem | undefined> => {
        if (busy || !current()) return;
        busy = true;
        try {
            while (current()) {
                const usable = candidates.filter(track => !attempted.has(JSON.stringify([track.platform, track.id])));
                const result = await tryCandidates(target, usable, async track => {
                    attempted.add(JSON.stringify([track.platform, track.id]));
                    const plugin = pluginFor(track);
                    if (!plugin || !PluginManager.getSearchablePlugins("music").includes(plugin) || (await profileFor(plugin)).tier === "disabled") return false;
                    track.$autoResolveTarget = { artist: target.artist, title: target.title };
                    const usePrepared = track.platform === prepared.track.platform && track.id === prepared.track.id;
                    let source = usePrepared && prepared.expiresAt > Date.now() ? prepared.source : await resolveSource(plugin, track, current);
                    const invalidate = () => {
                        if (preparedCache.get(resolvedKey(target))?.source.url === source?.url) preparedCache.remove(resolvedKey(target));
                    };
                    // A previously warmed URL may have been revoked early. Refresh
                    // that same identity once, then advance to another real source.
                    const refreshOnce = usePrepared && prepared.reused;
                    for (let pass = 0; pass <= Number(refreshOnce); pass++) {
                        if (!source?.url || !current()) return false;
                        errorDuringStart = false;
                        Player.onManagedPlaybackFailure(revision, () => {
                            invalidate();
                            errorDuringStart = true;
                            if (!busy) advance().catch(() => undefined);
                        });
                        try {
                            await Player.playResolvedCandidate(track, { ...source }, revision);
                            const deadline = Date.now() + (refreshOnce && pass === 0 ? SearchConfig.cachedStartTimeoutMs : SearchConfig.startTimeoutMs);
                            while (current() && !errorDuringStart && Date.now() < deadline) {
                                const state = (await NativePlayer.getPlaybackState()).state;
                                const progress = await NativePlayer.getProgress();
                                if (progress.duration > 0 && progress.duration <= 65) {
                                    invalidate(); return false;
                                }
                                if (state === State.Error) break;
                                if (state === State.Playing && progress.position > 0) {
                                    playbackMetric(prepared.reused ? "cached-playing" : "cold-playing", clicked);
                                    Player.confirmManagedCandidate(track, revision);
                                    // Keep the original expiry when using a cached URL.
                                    if (!usePrepared || pass > 0) preparedCache.set(resolvedKey(target), identityOnly(track), source, (await profileFor(plugin)).sourceId);
                                    await markAndroidPlaybackVerified(plugin);
                                    await remember(target, track);
                                    return true;
                                }
                                await new Promise<void>(resolve => setTimeout(resolve, 100));
                            }
                        } catch { /* Refresh an old URL or advance to another source. */ }
                        invalidate();
                        if (pass === 0 && refreshOnce && current()) {
                            source = await resolveSource(plugin, track, current);
                        }
                    }
                    return false;
                }, current);
                if (result) return result;
                if (!current()) return;
                if (!preferredEnded) {
                    const next = await preferred.next();
                    candidates = next.value ?? [];
                    preferredEnded = !!next.done;
                } else if (!backupEnded) {
                    const next = await backup.next();
                    candidates = next.value ?? [];
                    backupEnded = !!next.done;
                } else {
                    Player.onManagedPlaybackFailure(revision);
                    await NativePlayer.pause();
                    Toast.warn("暂时找不到可播放音源");
                    return;
                }
            }
        } finally {
            busy = false;
        }
    };
    return advance();
}

// Preserve scoped fallback for queue replay, next-song playback and saved favorites.
Player.setAutomaticResolver(playTarget);
