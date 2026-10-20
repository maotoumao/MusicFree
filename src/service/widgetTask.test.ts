export {};
const mockInit = jest.fn();
const mockAction = jest.fn();
const mockFinish = jest.fn();
const mockActive = jest.fn();
const mockInstallService = jest.fn();
const mockToast = jest.fn();
jest.mock("./playbackRuntime", () => ({ initTrackPlayer: (...args: any[]) => mockInit(...args) }));
jest.mock("./musicWidget", () => ({ runMusicWidgetAction: (...args: any[]) => mockAction(...args) }));
jest.mock("./index", () => (...args: any[]) => mockInstallService(...args));
jest.mock("@/utils/log", () => ({ errorLog: jest.fn() }));
jest.mock("@/core/i18n", () => ({ __esModule: true, default: { t: (key: string) => key } }));
jest.mock("react-native", () => ({
    NativeModules: { MusicWidget: { finishAction: (...args: any[]) => mockFinish(...args), isActionActive: (...args: any[]) => mockActive(...args) } },
    ToastAndroid: { show: (...args: any[]) => mockToast(...args), LONG: 1 },
}));
const runWidgetTask = require("./widgetTask").default;

beforeEach(() => {
    jest.clearAllMocks();
    mockInit.mockResolvedValue(undefined);
    mockAction.mockResolvedValue(undefined);
    mockFinish.mockResolvedValue(undefined);
    mockActive.mockResolvedValue(true);
});

it.each(["toggle", "previous", "next"])("restores in the background before %s and releases its service lease", async control => {
    let resolve!: () => void;
    mockInit.mockReturnValueOnce(new Promise<void>(done => {
        resolve = done;
    }));
    const pending = runWidgetTask({ control, request: "request-1" });
    expect(mockInstallService).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(mockInit).toHaveBeenCalledWith(undefined, true);
    expect(mockAction).not.toHaveBeenCalled();
    resolve();
    await pending;
    expect(mockAction).toHaveBeenCalledWith(control, expect.any(Function));
    expect(await mockAction.mock.calls[0][1]()).toBe(true);
    expect(mockActive).toHaveBeenCalledWith("request-1");
    expect(mockFinish).toHaveBeenCalledWith("request-1");
});

it("reports startup errors and releases the service instead of navigating to the UI", async () => {
    mockInit.mockRejectedValueOnce(new Error("plugin initialization failed"));
    await runWidgetTask({ control: "toggle", request: "failed" });
    expect(mockAction).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith("toast.widgetStartupFailed", 1);
    expect(mockFinish).toHaveBeenCalledWith("failed");
    await runWidgetTask({ control: "toggle", request: "retry" });
    expect(mockAction).toHaveBeenCalledTimes(1);
});

it("supplies the native startup deadline guard to queued actions", async () => {
    mockActive.mockResolvedValueOnce(false);
    await runWidgetTask({ control: "toggle", request: "expired" });
    expect(await mockAction.mock.calls[0][1]()).toBe(false);
    expect(mockFinish).toHaveBeenCalledWith("expired");
});

it("ignores invalid tasks and still releases a supplied lease", async () => {
    await runWidgetTask({ control: "delete", request: "invalid" });
    await runWidgetTask({});
    expect(mockInit).not.toHaveBeenCalled();
    expect(mockAction).not.toHaveBeenCalled();
    expect(mockFinish).toHaveBeenCalledTimes(1);
});

it("does not turn a service-cleanup failure into a headless task crash", async () => {
    mockFinish.mockRejectedValueOnce(new Error("service destroyed"));
    await expect(runWidgetTask({ control: "toggle", request: "gone" })).resolves.toBeUndefined();
});
