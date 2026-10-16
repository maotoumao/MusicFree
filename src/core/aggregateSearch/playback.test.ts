import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { playTarget, prepareTarget } from "./playback";
import { SearchConfig } from "./config";
import Player from "../trackPlayer";
import NativePlayer from "react-native-track-player";
import PluginManager, { Plugin } from "../pluginManager";
import { targetBatches } from "./service";
import Toast from "@/utils/toast";

let mockRevision = 0;
let mockFailure: (() => void) | undefined;
const mockStorage = new Map<string, string>();
jest.mock("@/utils/getOrCreateMMKV", () => () => ({
    getString: (key: string) => mockStorage.get(key),
    set: (key: string, value: string) => mockStorage.set(key, value),
}));
jest.mock("../trackPlayer", () => ({
    beginManagedPlayback: () => ++mockRevision,
    isManagedPlaybackCurrent: (revision: number) => revision === mockRevision,
    onManagedPlaybackFailure: (_: number, handler?: () => void) => {
        mockFailure = handler;
    },
    playResolvedCandidate: jest.fn(), confirmManagedCandidate: jest.fn(),
    setAutomaticResolver: jest.fn(),
}));
jest.mock("react-native-track-player", () => ({
    __esModule: true,
    default: { getPlaybackState: jest.fn(), getProgress: jest.fn(), pause: jest.fn() },
    State: { Playing: "playing", Error: "error" },
}));
jest.mock("../pluginManager", () => ({
    __esModule: true, default: { getByName: jest.fn(), getByHash: jest.fn(), getSearchablePlugins: jest.fn() },
}));
jest.mock("./service", () => ({ targetBatches: jest.fn() }));
jest.mock("../sourcePolicy/runtime", () => ({
    profileFor: async (plugin: Plugin) => ({ sourceId: plugin.hash, tier: plugin.name === "disabled" ? "disabled" : "preferred" }),
    markAndroidPlaybackVerified: jest.fn(),
}));
jest.mock("@/utils/toast", () => ({ warn: jest.fn() }));

const song = (platform: string, id = platform): IMusic.IMusicItem => ({ artist: "Artist", title: "Song", platform, id, duration: 200, album: "", artwork: "" });
const target = { artist: "Artist", title: "Song" };
function plugins(names: string[]) {
    const values = names.map(name => ({ name, hash: name, resolveAutomaticMediaSource: jest.fn(async () => ({ url: `https://audio.invalid/${name}` })) } as unknown as Plugin));
    jest.mocked(PluginManager.getByName).mockImplementation(name => values.find(p => p.name === name));
    jest.mocked(PluginManager.getByHash).mockImplementation(name => values.find(p => p.name === name));
    jest.mocked(PluginManager.getSearchablePlugins).mockReturnValue(values);
    return values;
}
beforeEach(() => {
    jest.clearAllMocks();
    mockStorage.clear();
    mockRevision = 0;
    mockFailure = undefined;
    jest.mocked(Player.playResolvedCandidate).mockResolvedValue(undefined);
    jest.mocked(NativePlayer.getPlaybackState).mockResolvedValue({ state: "playing" } as any);
    jest.mocked(NativePlayer.getProgress).mockResolvedValue({ position: 1, buffered: 30, duration: 240 });
});
afterEach(() => {
    jest.restoreAllMocks();
});
describe("shared automatic playback", () => {
    it("resolves preferred first, falls back to backup only after playback failure", async () => {
        plugins(["preferred", "backup", "disabled"]);
        const visited: string[] = [];
        jest.mocked(targetBatches).mockImplementation(async function* (_, tier) {
            visited.push(tier);
            yield tier === "preferred" ? [song("disabled"), song("preferred")] : [song("backup")];
        });
        jest.mocked(Player.playResolvedCandidate).mockRejectedValueOnce(new Error("decoder failed"));
        expect((await playTarget(target))?.platform).toBe("backup");
        expect(visited).toEqual(["preferred", "preferred", "backup"]);
        expect(jest.mocked(Player.playResolvedCandidate).mock.calls.map(c => c[0].platform)).toEqual(["preferred", "backup"]);
        expect(Player.confirmManagedCandidate).toHaveBeenCalledTimes(1);
    });
    it("reuses a prepared URL without searching or resolving again, keeping identity storage URL-free", async () => {
        const [plugin] = plugins(["preferred"]);
        const visited: string[] = [];
        jest.mocked(targetBatches).mockImplementation(async function* (_, tier) {
            visited.push(tier); yield [song("preferred")];
        });
        await playTarget(target);
        await playTarget(target);
        expect(visited).toEqual(["preferred"]);
        expect([...mockStorage].filter(([key]) => key.startsWith("identity.")).map(([, value]) => value).join()).not.toContain("https://audio.invalid");
        expect(plugin.resolveAutomaticMediaSource).toHaveBeenCalledTimes(1);
        expect(Player.playResolvedCandidate).toHaveBeenCalledTimes(2);
    });
    it("plays a background-prepared song with zero new plugin requests and preserves headers", async () => {
        const [plugin] = plugins(["preferred"]);
        const source = { url: "https://audio.invalid/full", headers: { Referer: "https://music.invalid/" }, userAgent: "Player" };
        jest.mocked(plugin.resolveAutomaticMediaSource).mockResolvedValue(source);
        jest.mocked(targetBatches).mockImplementation(async function* () {
            yield [song("preferred")];
        });
        await prepareTarget(target, () => true, 0);
        expect(Player.playResolvedCandidate).not.toHaveBeenCalled();
        jest.mocked(targetBatches).mockClear();
        jest.mocked(plugin.resolveAutomaticMediaSource).mockClear();
        await playTarget(target);
        expect(targetBatches).toHaveBeenCalledTimes(2); // Lazy generators are constructed, never advanced.
        expect(plugin.resolveAutomaticMediaSource).not.toHaveBeenCalled();
        expect(jest.mocked(Player.playResolvedCandidate).mock.calls[0][1]).toEqual(source);
    });
    it("joins in-flight preparation when tapped instead of resolving twice", async () => {
        const [plugin] = plugins(["preferred"]);
        let release!: (source: IPlugin.IMediaSourceResult) => void;
        jest.mocked(plugin.resolveAutomaticMediaSource).mockImplementation(() => new Promise(resolve => {
            release = resolve;
        }));
        jest.mocked(targetBatches).mockImplementation(async function* () {
            yield [song("preferred")];
        });
        let background = true;
        const warm = prepareTarget(target, () => background, 0);
        for (let i = 0; i < 40; i++) await Promise.resolve();
        const play = playTarget(target);
        for (let i = 0; i < 20; i++) await Promise.resolve();
        background = false;
        release({ url: "https://audio.invalid/joined" });
        await Promise.all([warm, play]);
        expect(plugin.resolveAutomaticMediaSource).toHaveBeenCalledTimes(1);
        expect(Player.playResolvedCandidate).toHaveBeenCalledTimes(1);
    });
    it("refreshes a revoked prepared URL once without repeating search", async () => {
        const [plugin] = plugins(["preferred"]);
        jest.mocked(plugin.resolveAutomaticMediaSource)
            .mockResolvedValueOnce({ url: "https://audio.invalid/old" })
            .mockResolvedValue({ url: "https://audio.invalid/new" });
        let searches = 0;
        jest.mocked(targetBatches).mockImplementation(async function* () {
            searches++; yield [song("preferred")];
        });
        await prepareTarget(target, () => true, 0);
        jest.mocked(Player.playResolvedCandidate).mockRejectedValueOnce(new Error("403"));
        await playTarget(target);
        expect(searches).toBe(1);
        expect(plugin.resolveAutomaticMediaSource).toHaveBeenCalledTimes(2);
        expect(jest.mocked(Player.playResolvedCandidate).mock.calls.map(call => call[1].url)).toEqual([
            "https://audio.invalid/old", "https://audio.invalid/new",
        ]);
    });
    it("expires prepared URLs without discarding the saved identity", async () => {
        const [plugin] = plugins(["preferred"]);
        let now = Date.now();
        jest.spyOn(Date, "now").mockImplementation(() => now);
        let searches = 0;
        jest.mocked(targetBatches).mockImplementation(async function* () {
            searches++; yield [song("preferred")];
        });
        await prepareTarget(target, () => true, 0);
        now += SearchConfig.preparedSourceMs + 1;
        await playTarget(target);
        expect(searches).toBe(1);
        expect(plugin.resolveAutomaticMediaSource).toHaveBeenCalledTimes(2);
    });
    it("does not reuse a prepared URL after its plugin is disabled", async () => {
        const values = plugins(["old", "new"]);
        jest.mocked(targetBatches).mockImplementation(async function* () {
            yield [song("old"), song("new")];
        });
        await prepareTarget(target, () => true, 0);
        jest.mocked(PluginManager.getSearchablePlugins).mockReturnValue([values[1]]);
        expect((await playTarget(target))?.platform).toBe("new");
        expect(jest.mocked(Player.playResolvedCandidate).mock.calls[0][0].platform).toBe("new");
    });
    it("never starts an old song when a newer click supersedes pending preparation", async () => {
        const [plugin] = plugins(["preferred"]);
        let release!: (source: IPlugin.IMediaSourceResult) => void;
        jest.mocked(plugin.resolveAutomaticMediaSource).mockImplementation(() => new Promise(resolve => {
            release = resolve;
        }));
        jest.mocked(targetBatches).mockImplementation(async function* () {
            yield [song("preferred")];
        });
        const play = playTarget(target);
        for (let i = 0; i < 40; i++) await Promise.resolve();
        mockRevision++;
        release({ url: "https://audio.invalid/obsolete" });
        await play;
        expect(Player.playResolvedCandidate).not.toHaveBeenCalled();
        expect(Toast.warn).not.toHaveBeenCalled();
    });
    it("rejects a native 30-second preview even when search metadata says full length", async () => {
        plugins(["preview", "full"]);
        jest.mocked(targetBatches).mockImplementation(async function* () {
            yield [song("preview"), song("full")];
        });
        jest.mocked(NativePlayer.getProgress).mockResolvedValueOnce({ position: 1, buffered: 20, duration: 30 });
        expect((await playTarget(target))?.platform).toBe("full");
        expect(Player.confirmManagedCandidate).toHaveBeenCalledTimes(1);
    });
    it("handles a later native playback error by advancing to remaining candidates", async () => {
        plugins(["first", "second"]);
        jest.mocked(targetBatches).mockImplementation(async function* () {
            yield [song("first"), song("second")];
        });
        await playTarget(target);
        mockFailure?.();
        for (let i = 0; i < 30; i++) await Promise.resolve();
        expect(jest.mocked(Player.playResolvedCandidate).mock.calls.map(c => c[0].platform)).toEqual(["first", "second"]);
    });
    it("reports a friendly failure only after exhausting candidates", async () => {
        plugins(["bad"]);
        jest.mocked(targetBatches).mockImplementation(async function* () {
            yield [song("bad")];
        });
        jest.mocked(Player.playResolvedCandidate).mockRejectedValue(new Error("unavailable"));
        await playTarget(target);
        expect(Toast.warn).toHaveBeenCalledWith("暂时找不到可播放音源");
        expect(Player.confirmManagedCandidate).not.toHaveBeenCalled();
    });
});
