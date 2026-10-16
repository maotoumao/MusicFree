import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getDefaultStore } from "jotai";
import type { Plugin } from "@/core/pluginManager";
import { RequestStateCode } from "@/constants/commonConst";
import { searchAggregateMusic, expandAggregateMusic } from "./aggregateMusic";
import { selectedSources } from "@/core/sourcePolicy/runtime";
import { aggregateSearchResultsAtom, PageStatus, pageStatusAtom } from "./atoms";

jest.mock("react-native-reanimated", () => ({ Easing: { out: () => () => 0 } }));
jest.mock("@/core/sourcePolicy/runtime", () => ({
    selectedSources: jest.fn(), profileFor: async () => ({ tier: "preferred", score: null }),
}));
jest.mock("@/core/sourceHealth", () => ({
    getSourceHealthSummary: () => ({ score: null, status: "untested" }),
}));

type Result = IPlugin.ISearchResult<"music">;
const store = getDefaultStore();
const result = () => store.get(aggregateSearchResultsAtom).music;
function song(platform: string, id = "1"): IMusic.IMusicItem {
    return { platform, id, title: "Song", artist: "Artist", album: "", artwork: "", duration: 180 };
}
function plugin(name: string, search: (query: string, page: number) => Promise<Result>): Plugin {
    return { name, hash: name, methods: { search } } as unknown as Plugin;
}
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => {
        resolve = done;
    });
    return { promise, resolve };
}

beforeEach(() => {
    store.set(aggregateSearchResultsAtom, {});
    store.set(pageStatusAtom, PageStatus.SEARCHING);
});

describe("aggregate music search state", () => {
    it("expands only backup sources and resumes each source at its own page", async () => {
        const primaryPages: number[] = [];
        const backupPages: number[] = [];
        const primary = plugin("preferred-expand", async (_, page) => {
            primaryPages.push(page);
            return { isEnd: page === 3, data: [song("preferred-expand", String(page))] };
        });
        const backup = plugin("backup-expand", async (_, page) => {
            backupPages.push(page);
            return { isEnd: page === 2, data: [song("backup-expand", String(page))] };
        });
        await searchAggregateMusic([primary], "expand-case", 1);
        await searchAggregateMusic([primary]);
        jest.mocked(selectedSources).mockResolvedValue([backup]);
        await expandAggregateMusic();
        expect(selectedSources).toHaveBeenCalledWith("backup");
        expect(primaryPages).toEqual([1, 2]);
        expect(backupPages).toEqual([1]);
        await searchAggregateMusic([primary, backup]);
        expect(primaryPages).toEqual([1, 2, 3]);
        expect(backupPages).toEqual([1, 2]);
        expect(result()?.state).toBe(RequestStateCode.FINISHED);
        expect(result()?.expanded).toBe(true);
    });
    it("merges pages, isolates failure, and skips ended sources", async () => {
        const seenPages: number[] = [];
        let endedCalls = 0;
        let failedCalls = 0;
        const plugins = [
            plugin("paged", async (_, page) => {
                seenPages.push(page);
                return { isEnd: page === 2, data: [song("paged")] };
            }),
            plugin("ended", async () => {
                endedCalls += 1;
                return { isEnd: true, data: [song("ended")] };
            }),
            plugin("failed", async () => {
                failedCalls += 1;
                throw new Error("offline");
            }),
        ];
        await searchAggregateMusic(plugins, "song", 1);
        expect(result()?.state).toBe(RequestStateCode.PARTLY_DONE);
        expect(result()?.data).toHaveLength(1);
        await searchAggregateMusic(plugins);
        expect(seenPages).toEqual([1, 2]);
        expect(endedCalls).toBe(1);
        expect(failedCalls).toBe(1);
        expect(result()?.data[0].candidates).toHaveLength(2);
        expect(result()?.state).toBe(RequestStateCode.FINISHED);
        await searchAggregateMusic(plugins);
        expect(seenPages).toEqual([1, 2]);
    });

    it("ignores an older response even when the query text is identical", async () => {
        const older = deferred<Result>();
        const newer = deferred<Result>();
        let calls = 0;
        const plugins = [plugin("source", () => ++calls === 1 ? older.promise : newer.promise)];
        const first = searchAggregateMusic(plugins, "same", 1);
        // Let the first request enter the shared queue before refreshing.
        await Promise.resolve();
        const second = searchAggregateMusic(plugins, "same", 1);
        await Promise.resolve();
        newer.resolve({ isEnd: true, data: [song("source", "new")] });
        await second;
        older.resolve({ isEnd: true, data: [song("source", "old")] });
        await first;
        expect(result()?.data[0].candidates[0].id).toBe("new");
    });

    it("blocks duplicate pagination while a first page is pending", async () => {
        const pending = deferred<Result>();
        let calls = 0;
        const plugins = [plugin("source", () => {
            calls += 1; return pending.promise;
        })];
        const first = searchAggregateMusic(plugins, "song", 1);
        await searchAggregateMusic(plugins);
        expect(calls).toBe(1);
        store.set(aggregateSearchResultsAtom, {});
        store.set(pageStatusAtom, PageStatus.EDITING);
        pending.resolve({ isEnd: true, data: [song("source")] });
        await first;
        expect(result()).toBeUndefined();
        expect(store.get(pageStatusAtom)).toBe(PageStatus.EDITING);
    });

    it("distinguishes all failures from a successful empty search and allows refresh", async () => {
        const failed = [plugin("bad", async () => {
            throw new Error("offline");
        })];
        await searchAggregateMusic(failed, "song", 1);
        expect(result()?.state).toBe(RequestStateCode.ERROR);
        const empty = plugin("empty", async () => ({ isEnd: true, data: [] }));
        await searchAggregateMusic([...failed, empty], "song", 1);
        expect(result()?.state).toBe(RequestStateCode.FINISHED);
        expect(result()?.data).toEqual([]);
        expect(store.get(pageStatusAtom)).toBe(PageStatus.RESULT);
    });
});
