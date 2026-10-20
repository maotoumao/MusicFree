export {};
const mockPersisted = new Map<string, any>();
const mockSource = jest.fn();
const mockNative = {
    addEventListener: jest.fn(),
    setRate: jest.fn(),
    setQueue: jest.fn().mockResolvedValue(undefined),
    seekTo: jest.fn().mockResolvedValue(undefined),
    play: jest.fn().mockResolvedValue(undefined),
};
jest.mock("@/components/dialogs/useDialog", () => ({ getCurrentDialog: jest.fn(), showDialog: jest.fn() }));
jest.mock("@/constants/commonConst", () => ({ internalFakeSoundKey: "fake", sortIndexSymbol: Symbol("index"), timeStampSymbol: Symbol("time") }));
jest.mock("@/constants/assetsConst", () => ({ ImgAsset: { albumDefault: 42 } }));
jest.mock("@/utils/log", () => ({ trace: jest.fn(), errorLog: jest.fn() }));
jest.mock("@/utils/delay", () => ({ __esModule: true, default: async () => undefined }));
jest.mock("@/utils/trackUtils", () => ({ musicIsPaused: () => true }));
jest.mock("jotai", () => {
    const { atom, createStore } = jest.requireActual("jotai/vanilla");
    const store = createStore();
    return { atom, getDefaultStore: () => store, useAtomValue: jest.fn() };
});
jest.mock("@/utils/mediaUtils", () => ({
    getLocalPath: jest.fn(),
    isSameMediaItem: (a: any, b: any) => !!a && !!b && a.id === b.id && a.platform === b.platform,
}));
jest.mock("@/utils/network", () => ({ __esModule: true, default: { isCellular: false } }));
jest.mock("@/utils/persistStatus", () => ({ __esModule: true, default: {
    get: (key: string) => mockPersisted.get(key),
    set: (key: string, value: any) => mockPersisted.set(key, value),
} }));
jest.mock("@/utils/qualities", () => ({ getQualityOrder: () => ["standard"] }));
jest.mock("@/utils/fileUtils", () => ({ resolveImportedAssetOrPath: () => "file:///default.jpg" }));
jest.mock("@/core/localMusicSheet", () => ({ __esModule: true, default: { isLocalMusic: () => false } }));
jest.mock("react-native-track-player", () => ({
    __esModule: true, default: mockNative,
    Event: { PlaybackActiveTrackChanged: "track", PlaybackError: "error" },
    State: { Paused: "paused", Playing: "playing" },
}));

const first = { id: "1", platform: "test", title: "First", url: "file:///first.mp3" };
const second = { id: "2", platform: "test", title: "Second", url: "file:///second.mp3" };
let player: any;
beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockSource.mockResolvedValue({ url: first.url });
    mockPersisted.clear();
    mockPersisted.set("music.playList", [{ ...first }, { ...second }]);
    mockPersisted.set("music.musicItem", { ...first });
    mockPersisted.set("music.progress", 93);
    player = require("./index").default;
    player.injectDependencies({ getConfig: () => undefined }, {}, { getByMedia: () => ({ methods: { getMediaSource: mockSource } }) });
});

it("restores a background queue without preloading sources or seeking an empty native player", async () => {
    await player.setupTrackPlayer({ background: true });
    expect(player.currentMusic.id).toBe(first.id);
    expect(player.playList).toHaveLength(2);
    expect(mockSource).not.toHaveBeenCalled();
    expect(mockNative.setQueue).not.toHaveBeenCalled();
    expect(mockNative.seekTo).not.toHaveBeenCalled();
    expect(mockPersisted.get("music.progress")).toBe(93);
});

it("resumes the saved position only after the restored song has a native source", async () => {
    await player.setupTrackPlayer({ background: true });
    await player.setTrackSource(first);
    expect(mockNative.seekTo).toHaveBeenCalledWith(93);
    expect(mockNative.setQueue.mock.invocationCallOrder[0]).toBeLessThan(mockNative.seekTo.mock.invocationCallOrder[0]);
    expect(mockNative.seekTo.mock.invocationCallOrder[0]).toBeLessThan(mockNative.play.mock.invocationCallOrder[0]);
    await player.setTrackSource(first);
    expect(mockNative.seekTo).toHaveBeenCalledTimes(1);
});

it("does not apply the previous song's saved position to a cold-start skip", async () => {
    await player.setupTrackPlayer({ background: true });
    await player.setTrackSource(second);
    expect(mockNative.seekTo).not.toHaveBeenCalled();
    expect(mockPersisted.get("music.progress")).toBe(0);
    await player.setTrackSource(first);
    expect(mockNative.seekTo).not.toHaveBeenCalled();
});

it.each([0, -1, NaN, Infinity])("ignores an invalid saved position: %p", async position => {
    mockPersisted.set("music.progress", position);
    await player.setupTrackPlayer({ background: true });
    await player.setTrackSource(first);
    expect(mockNative.seekTo).not.toHaveBeenCalled();
});

it("keeps normal UI startup preloading the selected song", async () => {
    await player.setupTrackPlayer();
    expect(mockSource).toHaveBeenCalledTimes(1);
    expect(mockNative.setQueue).toHaveBeenCalledTimes(1);
});
