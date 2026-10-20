export {};
const mockData = { config: jest.fn(), sheets: jest.fn(), history: jest.fn(), folder: jest.fn() };
const mockPlugins = jest.fn();
const mockQueue = jest.fn();
const mockLyrics = jest.fn();
const mockSetupNative = jest.fn();
const mockOptions = jest.fn();
const mockWidget = jest.fn();
const mockConfigValue = jest.fn();
const mockInject = jest.fn();
jest.mock("react-native", () => ({
    Platform: { OS: "android" },
}));
jest.mock("react-native-get-random-values", () => ({}));
jest.mock("@/constants/assetsConst", () => ({ ImgAsset: { logoTransparent: "icon" } }));
jest.mock("@/constants/pathConst", () => ({ __esModule: true, default: {
    dataPath: "data", logPath: "log", cachePath: "cache", pluginPath: "plugin",
    lrcCachePath: "lrc", downloadCachePath: "download-cache", localLrcPath: "local-lrc",
    downloadPath: "downloads", downloadMusicPath: "downloads/music",
} }));
jest.mock("@/core/appConfig", () => ({ __esModule: true, default: {
    setup: () => mockData.config(), getConfig: (...args: any[]) => mockConfigValue(...args),
} }));
jest.mock("@/core/musicSheet", () => ({ __esModule: true, default: {
    setup: () => mockData.sheets(), injectDependencies: mockInject,
} }));
jest.mock("@/core/musicHistory", () => ({ __esModule: true, default: {
    setup: () => mockData.history(), injectDependencies: mockInject,
} }));
jest.mock("@/core/pluginManager", () => ({ __esModule: true, default: {
    setup: () => mockPlugins(), injectDependencies: mockInject,
} }));
jest.mock("@/core/trackPlayer", () => ({ __esModule: true, default: {
    setupTrackPlayer: (...args: any[]) => mockQueue(...args), injectDependencies: mockInject,
} }));
jest.mock("@/core/lyricManager", () => ({ __esModule: true, default: {
    setup: () => mockLyrics(), injectDependencies: mockInject,
} }));
jest.mock("@/core/downloader", () => ({ __esModule: true, default: { injectDependencies: mockInject } }));
jest.mock("@/core/i18n", () => ({ __esModule: true, default: { setup: jest.fn() } }));
jest.mock("@/utils/fileUtils", () => ({ checkAndCreateDir: (...args: any[]) => mockData.folder(...args) }));
jest.mock("@/utils/log", () => ({ trace: jest.fn() }));
jest.mock("./musicWidget", () => ({ setupMusicWidget: () => mockWidget() }));
jest.mock("react-native-track-player", () => ({
    __esModule: true,
    default: { setupPlayer: (...args: any[]) => mockSetupNative(...args), updateOptions: (...args: any[]) => mockOptions(...args) },
    AppKilledPlaybackBehavior: { ContinuePlayback: "continue" },
    Capability: { Play: "play", Pause: "pause", SkipToNext: "next", SkipToPrevious: "previous", Stop: "stop", SeekTo: "seek" },
}));
const flush = async () => {
    for (let n = 0; n < 15; n++) await Promise.resolve();
};

beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    for (const mock of [...Object.values(mockData), mockPlugins, mockQueue, mockLyrics, mockSetupNative, mockOptions]) {
        mock.mockResolvedValue(undefined);
    }
    mockConfigValue.mockReturnValue(undefined);
});

it("coalesces headless and UI startup without restoring a running queue twice", async () => {
    const { initTrackPlayer, setupPlaybackData, setupPlaybackPlugins } = require("./playbackRuntime");
    let resolvePlugins!: () => void;
    mockPlugins.mockReturnValueOnce(new Promise<void>(done => {
        resolvePlugins = done;
    }));
    const background = initTrackPlayer(undefined, true);
    const foreground = initTrackPlayer();
    await flush();
    expect(mockSetupNative).toHaveBeenCalledTimes(1);
    expect(mockQueue).not.toHaveBeenCalled();
    resolvePlugins();
    await Promise.all([background, foreground]);
    await setupPlaybackData();
    await setupPlaybackPlugins();
    await initTrackPlayer();
    for (const mock of [mockData.config, mockData.history, mockData.sheets, mockPlugins, mockQueue, mockLyrics, mockWidget]) {
        expect(mock).toHaveBeenCalledTimes(1);
    }
    expect(mockQueue).toHaveBeenCalledWith({ background: true });
    expect(require("./playbackRuntime").startedFromWidget).toBe(true);
});

it("waits for the nested download directory before declaring data ready", async () => {
    const { setupPlaybackData } = require("./playbackRuntime");
    let resolveFolder!: () => void;
    mockData.folder.mockImplementation((folder: string) => folder === "downloads/music"
        ? new Promise<void>(done => {
            resolveFolder = done;
        }) : Promise.resolve());
    const ready = jest.fn();
    const pending = setupPlaybackData().then(ready);
    await flush();
    expect(ready).not.toHaveBeenCalled();
    expect(mockData.config).not.toHaveBeenCalled();
    resolveFolder();
    await pending;
    expect(ready).toHaveBeenCalledTimes(1);
});

it("retries failed native initialization while keeping successfully migrated data", async () => {
    const { initTrackPlayer } = require("./playbackRuntime");
    mockSetupNative.mockRejectedValueOnce(new Error("service unavailable"));
    await expect(initTrackPlayer(undefined, true)).rejects.toThrow("service unavailable");
    await initTrackPlayer(undefined, true);
    expect(mockSetupNative).toHaveBeenCalledTimes(2);
    expect(mockData.config).toHaveBeenCalledTimes(1);
    expect(mockQueue).toHaveBeenCalledTimes(1);
});

it("retries plugin initialization before restoring a queue", async () => {
    const { initTrackPlayer } = require("./playbackRuntime");
    mockPlugins.mockRejectedValueOnce(new Error("plugin directory unavailable"));
    await expect(initTrackPlayer()).rejects.toThrow("plugin directory unavailable");
    expect(mockQueue).not.toHaveBeenCalled();
    await initTrackPlayer();
    expect(mockPlugins).toHaveBeenCalledTimes(2);
    expect(mockQueue).toHaveBeenCalledWith({ background: false });
});

it("does not replace a restored queue when a later initialization step is retried", async () => {
    const { initTrackPlayer } = require("./playbackRuntime");
    mockLyrics.mockRejectedValueOnce(new Error("lyric setup failed"));
    await expect(initTrackPlayer(undefined, true)).rejects.toThrow("lyric setup failed");
    await initTrackPlayer();
    expect(mockQueue).toHaveBeenCalledTimes(1);
    expect(mockLyrics).toHaveBeenCalledTimes(2);
    expect(mockWidget).toHaveBeenCalledTimes(1);
});

it("attaches to an already initialized player and preserves notification options", async () => {
    const { initTrackPlayer } = require("./playbackRuntime");
    mockSetupNative.mockRejectedValueOnce({ code: "player_already_initialized" });
    mockConfigValue.mockImplementation((key: string) => key === "basic.showExitOnNotification" ? true : undefined);
    await initTrackPlayer();
    expect(mockOptions).toHaveBeenCalledWith(expect.objectContaining({
        capabilities: ["play", "pause", "next", "previous", "stop"],
        compactCapabilities: ["play", "pause", "next", "previous", "stop"],
        android: { alwaysPauseOnInterruption: true, appKilledPlaybackBehavior: "continue" },
    }));
});
