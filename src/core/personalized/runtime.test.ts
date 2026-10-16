import { beforeEach, expect, it, jest } from "@jest/globals";
import { configureRecommendations, recommendations } from "./runtime";
import Network from "@/utils/network";

const mockNetwork = Network as unknown as { isOffline: boolean; isCellular: boolean };
const mockGet = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock("axios", () => ({ create: () => ({ get: (...args: any[]) => mockGet(...args) }) }));
jest.mock("../musicSheet", () => ({ getSortedMusicListBySheetId: () => ({ musicList: [] }) }));
jest.mock("../musicHistory", () => ({ history: [] }));
jest.mock("../appConfig", () => ({ getConfig: () => false }));
jest.mock("@/utils/network", () => ({ isOffline: false, isCellular: false }));
jest.mock("@/utils/getOrCreateMMKV", () => {
    const stores = new Map<string, Map<string, string>>();
    return { __esModule: true, stores, default: (name: string) => {
        const values = stores.get(name) ?? new Map<string, string>();
        stores.set(name, values);
        return {
            getString: (key: string) => values.get(key),
            set: (key: string, value: string) => values.set(key, value),
            delete: (key: string) => values.delete(key),
            clearAll: () => values.clear(),
        };
    } };
});
const mockStores = (jest.requireMock("@/utils/getOrCreateMMKV") as { stores: Map<string, Map<string, string>> }).stores;
const seed = { artist: "Artist", title: "Seed" };
const response = { data: { similartracks: { track: [{ name: "Candidate", artist: { name: "Singer" } }] } } };
beforeEach(() => {
    configureRecommendations();
    mockGet.mockReset();
    mockNetwork.isOffline = false;
    mockNetwork.isCellular = false;
});
it("does not contact Last.fm without explicit opt-in", async () => {
    await expect(recommendations.generate([seed], [])).rejects.toThrow();
    expect(mockGet).not.toHaveBeenCalled();
});
it("uses the user's key only after opt-in and clears recommendation-service data on disable", async () => {
    configureRecommendations("a".repeat(32));
    mockGet.mockResolvedValue(response);
    expect((await recommendations.generate([seed], [])).candidates).toHaveLength(1);
    expect(mockGet.mock.calls[0][0]).toBe("https://ws.audioscrobbler.com/2.0/");
    expect(mockGet.mock.calls[0][1].params).toMatchObject({ artist: "Artist", track: "Seed", api_key: "a".repeat(32) });
    configureRecommendations();
    expect(mockStores.get("personalized.v1")?.size).toBe(0);
    expect(mockStores.get("personalized.settings.v1")?.size).toBe(0);
});
it("aborts in-flight work and prevents late responses from restoring cleared caches", async () => {
    configureRecommendations("a".repeat(32));
    let release!: (value: typeof response) => void;
    mockGet.mockImplementation(() => new Promise(resolve => {
        release = resolve;
    }));
    const pending = recommendations.generate([seed], []).catch(() => undefined);
    for (let i = 0; i < 20 && !release; i++) await Promise.resolve();
    const signal = mockGet.mock.calls[0][1].signal as AbortSignal;
    configureRecommendations();
    expect(signal.aborted).toBe(true);
    release(response);
    await pending;
    expect(mockStores.get("personalized.v1")?.size).toBe(0);
    expect(mockGet).toHaveBeenCalledTimes(1);
});
it("honors offline and disallowed cellular-network settings", async () => {
    configureRecommendations("a".repeat(32));
    mockNetwork.isCellular = true;
    await expect(recommendations.generate([seed], [])).rejects.toThrow();
    mockNetwork.isCellular = false;
    mockNetwork.isOffline = true;
    await expect(recommendations.generate([seed], [])).rejects.toThrow();
    expect(mockGet).not.toHaveBeenCalled();
});
