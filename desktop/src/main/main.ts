/**
 * MusicFree 桌面版主进程入口
 *
 * Wayland/X11 自动适配:Chromium Ozone 平台层自动探测显示协议,
 * 另外提供 ELECTRON_OZONE_PLATFORM_HINT 与 --ozone-platform 显式覆盖。
 */
import { app, BrowserWindow, ipcMain, shell, nativeImage } from "electron";
import * as path from "path";
import { setupMediaProxy, registerSchemes } from "./media-proxy";
import { registerIpcHandlers, broadcastRendererEvent, setMprisService } from "./ipc";
import { createTray, destroyTray } from "./tray";
import { MprisService } from "./mpris";
import { LyricWindowManager } from "./lyric-window";

// ---------------------------------------------------------------- 常量
const isDev = !app.isPackaged;
const rendererRoot = isDev
    ? path.resolve(__dirname, "../renderer")
    : path.resolve(__dirname, "../../renderer");

let mainWindow: BrowserWindow | null = null;
let lyricWindowManager: LyricWindowManager | null = null;
let mprisService: MprisService | null = null;

// 应用关闭策略:true 表示关闭窗口时最小化到托盘
let minimizeToTray = true;
let isQuiting = false;

/** 桌面端 UA(部分音源接口屏蔽 Electron 默认 UA) */
export const DESKTOP_USER_AGENT =
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 MusicFreeDesktop/0.6.2";

// ---------------------------------------------------------------- 命令行开关
function setupCommandLine() {
    // Wayland/X11 自动适配:Ozone 平台层跟随 WAYLAND_DISPLAY / DISPLAY。
    // 注意必须用 appendSwitch(在 Chromium 初始化前生效);
    // 在 JS 里设 process.env.ELECTRON_OZONE_PLATFORM_HINT 为时已晚,
    // 会导致 Ozone 平台初始化失败、窗口不创建(黑屏)。
    app.commandLine.appendSwitch("ozone-platform-hint", "auto");
    app.commandLine.appendSwitch("enable-features", "WaylandWindowDecorations");
    // Wayland 文本输入协议(fcitx5 等输入法)
    app.commandLine.appendSwitch("enable-wayland-ime");
    app.commandLine.appendSwitch("wayland-text-input-version", "3");
    // 允许 http 混合内容(部分音源是 http)
    app.commandLine.appendSwitch("allow-running-insecure-content");
    // 音视频硬件解码(部分 Wayland 合成器需要)
    app.commandLine.appendSwitch("enable-gpu-rasterization");
    app.commandLine.appendSwitch("ignore-gpu-blocklist");
}

// ---------------------------------------------------------------- 主窗口
function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 420,
        height: 780,
        minWidth: 360,
        minHeight: 600,
        useContentSize: true,
        // 窗口不透明;网页内容自带深色背景。透明窗口在无 GPU 环境下
        // capturePage 会得到全空帧,且 Wayland 合成器对透明窗口支持不一
        backgroundColor: "#202020",
        show: false,
        frame: true,
        title: "MusicFree",
        icon: resolveIcon(),
        webPreferences: {
            preload: path.resolve(__dirname, "../preload/preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            spellcheck: false,
            webSecurity: true,
        },
    });

    // 移动端形态的固定窗口尺寸
    mainWindow.setAspectRatio(420 / 780, { width: 0, height: 0 });

    mainWindow.once("ready-to-show", () => {
        mainWindow?.show();
    });

    // 关闭 → 托盘 or 退出
    mainWindow.on("close", (e) => {
        if (!isQuiting && minimizeToTray) {
            e.preventDefault();
            mainWindow?.hide();
            return;
        }
        // 真正退出时销毁歌词窗口
        lyricWindowManager?.destroy();
    });

    // 外部链接交给系统默认浏览器
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: "deny" };
    });

    if (isDev) {
        // 渲染进程控制台转发到主进程 stdout(便于无头环境诊断)
        mainWindow.webContents.on("console-message", (_e, _level, message) => {
            console.log(`[renderer] ${message}`);
        });
        // 无头环境截图验证(--screenshot=path 触发,延时等待渲染稳定)
        const shotArg = process.argv.find(a => a.startsWith("--screenshot="));
        if (shotArg) {
            const shotPath = shotArg.slice("--screenshot=".length);
            setTimeout(async () => {
                try {
                    const domInfo = await mainWindow!.webContents.executeJavaScript(`(() => ({
                        rootChildren: document.getElementById('root')?.children.length ?? -1,
                        svgCount: document.getElementsByTagName('svg').length,
                    }))()`);
                    console.log("[screenshot-dom]", JSON.stringify(domInfo));
                    const img = await mainWindow!.webContents.capturePage();
                    require("fs").writeFileSync(shotPath, img.toPNG());
                    console.log(`[screenshot] saved: ${shotPath}`);
                } catch (err) {
                    console.error("[screenshot] failed:", err);
                }
            }, 8000);
        }
        mainWindow.webContents.on(
            "render-process-gone",
            (_e, details) => {
                console.error("[renderer] process gone:", details.reason, details.exitCode);
            },
        );
        mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
            console.error(`[renderer] load failed: ${code} ${desc} ${url}`);
        });
        // 开发者工具
        mainWindow.webContents.on("before-input-event", (event, input) => {
            if (input.control && input.shift && input.key.toLowerCase() === "i") {
                mainWindow?.webContents.toggleDevTools();
            }
        });
    }

    mainWindow.loadFile(path.join(rendererRoot, "index.html"));
    return mainWindow;
}

function resolveIcon(): Electron.NativeImage | undefined {
    const iconPath = isDev
        ? path.resolve(__dirname, "../../assets/icon.png")
        : path.resolve(process.resourcesPath, "icon.png");
    try {
        return nativeImage.createFromPath(iconPath);
    } catch {
        return undefined;
    }
}

export function getMainWindow() {
    return mainWindow;
}

// ---------------------------------------------------------------- 应用生命周期
// 深链协议注册(musicfree://install/xxx 一键装插件)
app.setAsDefaultProtocolClient("musicfree");

// 首次启动可能通过深链唤起:记录 argv 中的 musicfree:// URL
let initialUrl: string | null = null;
for (const arg of process.argv) {
    if (arg.startsWith("musicfree://")) {
        initialUrl = arg;
        break;
    }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else if (!process.env.ELECTRON_OZONE_PLATFORM_HINT) {
    // Wayland/X11 自动适配:ELECTRON_OZONE_PLATFORM_HINT 必须在进程启动前生效,
    // JS 内设置或 appendSwitch 都为时已晚(Ozone 平台在 Chromium 早期初始化)。
    // 打包后的可执行文件没有 npm 脚本包装,这里 spawn 重启自身补上环境变量。
    const { spawn } = require("child_process");
    try {
        const child = spawn(process.execPath, process.argv.slice(1), {
            env: { ...process.env, ELECTRON_OZONE_PLATFORM_HINT: "auto" },
            detached: true,
            stdio: "ignore",
            cwd: process.cwd(),
        });
        child.unref();
    } catch (e) {
        console.error("[ozone-relaunch] spawn failed:", e);
    }
    app.exit(0);
} else {
    setupCommandLine();
    registerSchemes();
    init();
}

function init() {

    app.on("second-instance", (_e, argv) => {
        // 二次启动:聚焦已有窗口,并处理深链(musicfree://install/xxx)
        const url = argv.find((it) => it.startsWith("musicfree://"));
        if (mainWindow) {
            if (mainWindow.isMinimized()) {
                mainWindow.restore();
            }
            mainWindow.show();
            mainWindow.focus();
        }
        if (url) {
            broadcastRendererEvent("open-url", url);
        }
    });

    app.whenReady().then(async () => {
        // 1. http/https 媒体代理(解决 CORS / 混合内容 / Range)
        setupMediaProxy();

        // 2. IPC 服务
        registerIpcHandlers({
            getMainWindow: () => mainWindow,
            getLyricManager: () => lyricWindowManager,
            getUserAgent: () => DESKTOP_USER_AGENT,
            onLyricWindowCreated: (manager) => {
                lyricWindowManager = manager;
            },
        });

        // 3. 主窗口
        createMainWindow();

        // 4. 系统托盘
        createTray({
            getWindow: () => mainWindow,
            onQuit: () => {
                isQuiting = true;
                app.quit();
            },
            onShowLyric: async () => {
                if (!lyricWindowManager) {
                    lyricWindowManager = new LyricWindowManager();
                    await lyricWindowManager.create();
                }
                lyricWindowManager.toggle();
            },
        });

        // 5. MPRIS 媒体键(GNOME/KDE 桌面集成)
        try {
            mprisService = new MprisService(() => mainWindow);
            await mprisService.init();
            setMprisService(mprisService);
        } catch (err) {
            console.warn("[mpris] init failed:", err);
        }

        app.on("activate", () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createMainWindow();
            }
        });
    });

    app.on("before-quit", () => {
        isQuiting = true;
        mprisService?.destroy();
        destroyTray();
    });

    app.on("window-all-closed", () => {
        // Linux 桌面保持托盘常驻(与移动端通知栏语义一致)
        if (!minimizeToTray || isQuiting) {
            app.quit();
        }
    });
}

// 渲染进程桥接 ------------------------------------------------------------
ipcMain.handle("app:quit", () => {
    isQuiting = true;
    app.quit();
});

ipcMain.handle("app:minimize", () => {
    mainWindow?.minimize();
});

ipcMain.handle("app:hide", () => {
    mainWindow?.hide();
});

ipcMain.handle("app:is-quiting", () => isQuiting);

ipcMain.handle("app:set-close-behavior", (_e, toTray: boolean) => {
    minimizeToTray = toTray;
});

ipcMain.handle("app:open-external", async (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) {
        await shell.openExternal(url);
    }
});

ipcMain.handle("app:version", () => app.getVersion());

ipcMain.handle("app:get-initial-url", () => initialUrl);
