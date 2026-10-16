import { beforeEach, expect, it, jest } from "@jest/globals";
import PluginManager, { Plugin } from "../pluginManager";
import { selectedSources, setSourceTier, profileFor } from "./runtime";

const mockStorage = new Map<string, string>();
jest.mock("@/utils/getOrCreateMMKV", () => () => ({ getString: (key: string) => mockStorage.get(key), set: (key: string, value: string) => mockStorage.set(key, value) }));
jest.mock("react-native-fs", () => ({ hash: async (path: string) => path }));
jest.mock("../pluginManager", () => ({ __esModule: true, default: { getSortedSearchablePlugins: jest.fn() } }));
const source = (id: string) => ({ path: id, hash: `runtime-${id}`, name: "same-name" } as Plugin);
beforeEach(() => {
    jest.clearAllMocks();
    mockStorage.clear();
});

it("uses enabled installed order without a bundled provider catalog", async () => {
    const sources = [source("one"), source("two")];
    jest.mocked(PluginManager.getSortedSearchablePlugins).mockReturnValue(sources);
    expect(await selectedSources("preferred")).toEqual(sources);
    expect(await selectedSources("backup")).toEqual([]);
    expect((await profileFor(sources[0])).score).toBeNull();
});

it("binds explicit backup and exclusion choices to the plugin file, not its name", async () => {
    const sources = [source("one"), source("two"), source("three")];
    jest.mocked(PluginManager.getSortedSearchablePlugins).mockReturnValue(sources);
    await setSourceTier(sources[0], "backup");
    await setSourceTier(sources[1], "disabled");
    expect(await selectedSources("preferred")).toEqual([sources[2]]);
    expect(await selectedSources("backup")).toEqual([sources[0]]);
});
