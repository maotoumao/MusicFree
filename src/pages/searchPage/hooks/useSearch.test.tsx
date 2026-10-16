import React from "react";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, create, ReactTestRenderer } from "react-test-renderer";
import { getDefaultStore } from "jotai";
import PluginManager, { Plugin } from "@/core/pluginManager";
import { RequestStateCode } from "@/constants/commonConst";
import {
    aggregateSearchResultsAtom, initSearchResults, PageStatus, pageStatusAtom, searchResultsAtom,
} from "../store/atoms";
import useSearch from "./useSearch";

jest.mock("react-native-reanimated", () => ({ Easing: { out: () => () => 0 } }));
jest.mock("@/core/sourcePolicy/runtime", () => ({
    selectedSources: async () => require("@/core/pluginManager").default.getSortedSearchablePlugins("music"),
    profileFor: async () => ({ tier: "preferred", score: null }),
}));
jest.mock("@/utils/log", () => ({ devLog: jest.fn(), errorLog: jest.fn(), trace: jest.fn() }));
jest.mock("@/core/sourceHealth", () => ({
    getSourceHealthSummary: () => ({ score: null, status: "untested" }),
}));
jest.mock("@/core/pluginManager", () => ({
    __esModule: true,
    default: { getByHash: jest.fn(), getSearchablePlugins: jest.fn(), getSortedSearchablePlugins: jest.fn() },
}));

const store = getDefaultStore();
let search: ReturnType<typeof useSearch>;
let renderer: ReactTestRenderer;
function Harness() {
    search = useSearch();
    return null;
}
type Result = IPlugin.ISearchResult<"music">;
function deferred() {
    let resolve!: (value: Result) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<Result>((done, fail) => {
        resolve = done; reject = fail;
    });
    return { promise, resolve, reject };
}
function source(searchMethod: (query: string, page: number, type: string) => Promise<unknown>) {
    const plugin = {
        name: "source", hash: "source", instance: { platform: "source" }, methods: { search: searchMethod },
    } as unknown as Plugin;
    jest.mocked(PluginManager.getByHash).mockReturnValue(plugin);
    jest.mocked(PluginManager.getSearchablePlugins).mockReturnValue([plugin]);
    jest.mocked(PluginManager.getSortedSearchablePlugins).mockReturnValue([plugin]);
    return plugin;
}

beforeEach(() => {
    jest.clearAllMocks();
    store.set(searchResultsAtom, initSearchResults);
    store.set(aggregateSearchResultsAtom, {});
    store.set(pageStatusAtom, PageStatus.SEARCHING);
    act(() => {
        renderer = create(<Harness />);
    });
});
afterEach(() => {
    act(() => renderer.unmount());
});

describe("search mode integration", () => {
    it("keeps non-music searches in plugin state", async () => {
        const item = { id: "album", platform: "source", title: "Album" };
        const calls: unknown[][] = [];
        source(async (...args) => {
            calls.push(args); return { isEnd: true, data: [item] };
        });
        await search("album query", 1, "album");
        expect(calls).toEqual([["album query", 1, "album"]]);
        expect(store.get(searchResultsAtom).album.source.data).toEqual([item]);
        expect(store.get(aggregateSearchResultsAtom)).toEqual({});
    });

    it("keeps explicit music plugin search separate and advances pages", async () => {
        const pages: number[] = [];
        source(async (_, page) => {
            pages.push(page);
            return { isEnd: page === 2, data: [{ id: String(page), platform: "source" }] };
        });
        await search("song", 1, "music", "source");
        await search(undefined, undefined, "music", "source");
        expect(pages).toEqual([1, 2]);
        expect(store.get(searchResultsAtom).music.source.data).toHaveLength(2);
        expect(store.get(aggregateSearchResultsAtom)).toEqual({});
    });

    it.each([false, true])("rejects stale per-plugin results after a new query (failure: %s)", async fail => {
        const old = deferred();
        source(query => query === "old" ? old.promise : Promise.resolve({ isEnd: true, data: [] }));
        const first = search("old", 1, "music", "source");
        await Promise.resolve();
        store.set(searchResultsAtom, initSearchResults);
        await search("new", 1, "music", "source");
        if (fail) old.reject(new Error("old failure"));
        else old.resolve({ isEnd: false, data: [] });
        await first;
        const current = store.get(searchResultsAtom).music.source;
        expect(current.query).toBe("new");
        expect(current.state).toBe(RequestStateCode.FINISHED);
    });

    it("routes default music search to All Sources", async () => {
        source(async () => ({ isEnd: true, data: [{
            id: "1", platform: "source", title: "Song", artist: "Artist",
        }] }));
        await search("song", 1);
        expect(PluginManager.getSortedSearchablePlugins).toHaveBeenCalledWith("music");
        expect(store.get(aggregateSearchResultsAtom).music?.data).toHaveLength(1);
        expect(store.get(searchResultsAtom).music).toEqual({});
    });

    it("retries a failed plugin page without skipping it or discarding earlier results", async () => {
        const pages: number[] = [];
        source(async (_, page) => {
            pages.push(page);
            if (pages.length === 2) throw new Error("temporary failure");
            return { isEnd: page === 2, data: [{ id: String(page), platform: "source" }] };
        });
        await search("song", 1, "music", "source");
        await search(undefined, undefined, "music", "source");
        expect(store.get(searchResultsAtom).music.source.state).toBe(RequestStateCode.ERROR);
        await search(undefined, undefined, "music", "source");
        expect(pages).toEqual([1, 2, 2]);
        expect(store.get(searchResultsAtom).music.source.data.map(item => item.id)).toEqual(["1", "2"]);
    });
});
