export {};
const mockBuild = jest.fn();
const mockPlay = jest.fn();
const mockToast = jest.fn();
const mockPlugins = jest.fn();
const mockHistory = Array.from({ length: 45 }, (_, id) => ({ id, artist: `Artist ${id % 2}` }));
const mockQueue = [{ id: "queued" }];
jest.mock("@/core/i18n", () => ({ __esModule: true, default: { t: (key: string) => key } }));
jest.mock("@/core/musicHistory", () => ({ __esModule: true, default: { history: mockHistory } }));
jest.mock("@/core/pluginManager", () => ({ __esModule: true, default: { getSortedPluginsWithAbility: (...args: any[]) => mockPlugins(...args) } }));
jest.mock("@/core/randomPlay", () => ({ buildShiYinQueue: (...args: any[]) => mockBuild(...args), getPrimaryArtist: (artist: string) => artist, SHIYIN_QUEUE_SIZE: 30 }));
jest.mock("@/core/trackPlayer", () => ({ __esModule: true, default: { playList: mockQueue, playWithReplacePlayList: (...args: any[]) => mockPlay(...args) } }));
jest.mock("react-native", () => ({ ToastAndroid: { show: (...args: any[]) => mockToast(...args), LONG: 1 } }));
const { startWidgetShiYin } = require("./widgetShiYin");

beforeEach(() => {
    jest.clearAllMocks();
    mockPlugins.mockReturnValue(["enabled chart source"]);
    mockBuild.mockResolvedValue({ musicList: [{ id: "picked" }], poolSize: 20 });
    mockPlay.mockResolvedValue(undefined);
});

it("uses enabled chart sources and the same history/queue constraints as home", async () => {
    await startWidgetShiYin();
    expect(mockPlugins).toHaveBeenCalledWith("getTopLists");
    expect(mockBuild).toHaveBeenCalledWith({
        plugins: ["enabled chart source"],
        excludeMusicItems: [...mockHistory.slice(0, 10), ...mockQueue],
        preferredArtists: ["Artist 0", "Artist 1"], queueSize: 30,
    });
    expect(mockPlay).toHaveBeenCalledWith({ id: "picked" }, [{ id: "picked" }]);
    expect(mockToast).toHaveBeenCalledWith("toast.shiyinStarted", 1);
});

it("leaves playback untouched when no chart source is enabled", async () => {
    mockPlugins.mockReturnValue([]);
    await startWidgetShiYin();
    expect(mockBuild).not.toHaveBeenCalled();
    expect(mockPlay).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith("toast.shiyinNoSource", 1);
});

it.each([[0, "toast.shiyinPoolEmpty"], [20, "toast.shiyinNoMusic"]])("explains an empty result with pool size %s", async (poolSize, message) => {
    mockBuild.mockResolvedValue({ musicList: [], poolSize });
    await startWidgetShiYin();
    expect(mockPlay).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(message, 1);
});

it.each(["build", "play"])("reports %s failures without a false success", async stage => {
    (stage === "build" ? mockBuild : mockPlay).mockRejectedValue(new Error("unavailable"));
    await startWidgetShiYin();
    expect(mockToast).toHaveBeenCalledWith("toast.shiyinNoMusic", 1);
    expect(mockToast).not.toHaveBeenCalledWith("toast.shiyinStarted", 1);
});

it("does not start late playback after a native task expired during discovery", async () => {
    await startWidgetShiYin(async () => false);
    expect(mockBuild).toHaveBeenCalledTimes(1);
    expect(mockPlay).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
});
