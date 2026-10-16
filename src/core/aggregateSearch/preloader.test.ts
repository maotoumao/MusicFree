import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { warmRecommendations } from "./preloader";
import { prepareTarget } from "./playback";
import { songKey } from "../musicIdentity";

jest.mock("./playback", () => ({ prepareTarget: jest.fn() }));
const targets = Array.from({ length: 30 }, (_, i) => ({ artist: "Artist", title: `Song ${i}` }));
const flush = async () => {
    for (let i = 0; i < 160; i++) await Promise.resolve();
};
beforeEach(() => {
    jest.useFakeTimers(); jest.clearAllMocks();
});
afterEach(() => {
    jest.clearAllTimers(); jest.useRealTimers();
});

describe("recommendation preloading", () => {
    it("prepares studio and live versions separately", async () => {
        jest.mocked(prepareTarget).mockImplementation(async target => ({ track: { ...target } }) as any);
        const job = warmRecommendations([{ artist: "Artist", title: "Song" }, { artist: "Artist", title: "Song (Live)" }]);
        await flush();
        expect(prepareTarget).toHaveBeenCalledTimes(2);
        job.stop();
    });
    it("includes fallback for on-screen songs before spending time on off-screen primary searches", async () => {
        jest.mocked(prepareTarget).mockResolvedValue(undefined);
        const job = warmRecommendations(targets, undefined, undefined, targets.slice(0, 2).map(songKey));
        await flush();
        const calls = jest.mocked(prepareTarget).mock.calls;
        expect(calls.slice(0, 2).map(call => call[3])).toEqual([true, true]);
        expect(calls[2][0]).toEqual(targets[2]);
        job.stop();
    });
    it("prepares all 30 songs, with at most two workers and without playing anything", async () => {
        let active = 0;
        let maximum = 0;
        jest.mocked(prepareTarget).mockImplementation(async target => {
            active++;
            maximum = Math.max(maximum, active);
            await Promise.resolve();
            active--;
            return { track: { ...target } } as any;
        });
        const ready = jest.fn();
        const job = warmRecommendations(targets, ready);
        await flush();
        expect(maximum).toBe(2);
        expect(prepareTarget).toHaveBeenCalledTimes(30);
        expect(ready).toHaveBeenCalledTimes(30);
        job.stop();
    });
    it("moves newly visible songs ahead of off-screen songs and stops on navigation", async () => {
        const release: Array<() => void> = [];
        jest.mocked(prepareTarget).mockImplementation(() => new Promise(resolve => release.push(() => resolve(undefined))));
        const job = warmRecommendations(targets);
        expect(prepareTarget).toHaveBeenCalledTimes(2);
        job.prioritize([songKey(targets[20])]);
        release.shift()!();
        await flush();
        expect(jest.mocked(prepareTarget).mock.calls[2][0]).toEqual(targets[20]);
        job.stop();
        release.forEach(done => done());
        await flush();
        expect(prepareTarget).toHaveBeenCalledTimes(3);
    });
    it("tries preferred sources across the batch before revisiting misses with backup sources", async () => {
        jest.mocked(prepareTarget).mockResolvedValue(undefined);
        const job = warmRecommendations(targets);
        await flush();
        const calls = jest.mocked(prepareTarget).mock.calls;
        expect(calls).toHaveLength(60);
        expect(calls.slice(0, 30).every(call => call[3] === false)).toBe(true);
        expect(calls.slice(30).every(call => call[3] === true)).toBe(true);
        job.stop();
    });
});
