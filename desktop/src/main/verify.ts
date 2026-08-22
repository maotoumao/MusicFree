/**
 * 无头环境功能验证脚本(复用真实应用的初始化路径)
 *
 * 用法:
 *   DISPLAY=:95 electron dist/main/verify.js --no-sandbox          # X11
 *   DISPLAY=:95 electron dist/main/verify.js --no-sandbox --wayland # Wayland
 *
 * 通过 executeJavaScript 注入探针,验证渲染进程 DOM / 播放器 / 插件系统状态,
 * 最后 capturePage 截图保存到 /tmp/mf-verify.png。
 */
import { app, BrowserWindow } from "electron";
import * as path from "path";
import { setupMediaProxy, registerSchemes } from "./media-proxy";
import { registerIpcHandlers } from "./ipc";

const isWayland = process.argv.includes("--wayland");
// 本脚本自带环境变量,跳过 main.ts 的 ozone-relaunch 逻辑
process.env.ELECTRON_OZONE_PLATFORM_HINT = isWayland ? "wayland" : "auto";

const rendererRoot = path.resolve(__dirname, "../renderer");
let mainWindow: BrowserWindow | null = null;

async function main() {
    registerSchemes();
    registerIpcHandlers({
        getMainWindow: () => mainWindow,
        getLyricManager: () => null,
        getUserAgent: () =>
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        onLyricWindowCreated: () => {},
    });

    await app.whenReady();
    setupMediaProxy();

    mainWindow = new BrowserWindow({
        width: 420,
        height: 780,
        show: false,
        webPreferences: {
            preload: path.resolve(__dirname, "../preload/preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });
    mainWindow.webContents.on("console-message", (_e, _l, msg) => {
        console.log(`[renderer] ${msg}`);
    });
    await mainWindow.loadFile(path.join(rendererRoot, "index.html"));

    // 等待 bootstrap 完成并渲染稳定
    await new Promise((r) => setTimeout(r, 15000));

    const probe = async (name: string, code: string) => {
        try {
            const result = await mainWindow!.webContents.executeJavaScript(code);
            console.log(`[probe] ${name}: ${JSON.stringify(result)}`);
        } catch (err) {
            console.log(`[probe] ${name}: FAILED - ${(err as Error).message}`);
        }
    };

    await probe("simple", "1+1");
    await probe(
        "dom",
        `(() => {
            const root = document.getElementById('root');
            return {
                rootChildren: root ? root.children.length : -1,
                svgCount: document.getElementsByTagName('svg').length,
                bodyText: document.body.innerText.slice(0, 300),
            };
        })()`,
    );

    // 能力探针:MediaSession / Audio / 协议支持
    await probe(
        "capabilities",
        `(() => ({
            mediaSession: typeof navigator !== 'undefined' && 'mediaSession' in navigator,
            audioConstructor: typeof Audio !== 'undefined',
            hlslSupported: typeof window.Hls !== 'undefined',
            localStorage: typeof localStorage !== 'undefined',
            userAgent: navigator.userAgent.slice(0, 60),
        }))()`,
    );

    // 交互探针:点击侧栏"插件管理"导航到插件页,验证路由与插件系统 UI
    await probe(
        "navigate-plugins",
        `(async () => {
            const findByText = (txt) => {
                const els = Array.from(document.querySelectorAll('div,span'));
                return els.find((el) => el.textContent === txt && el.children.length === 0);
            };
            const el = findByText('插件管理');
            if (!el) return { found: false };
            el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            el.click();
            await new Promise((r) => setTimeout(r, 1500));
            return {
                found: true,
                bodyText: document.body.innerText.slice(0, 400),
            };
        })()`,
    );

    // 返回主页(验证返回导航)
    await probe(
        "navigate-back",
        `(async () => {
            const findByText = (txt) => {
                const els = Array.from(document.querySelectorAll('div,span'));
                return els.find((el) => el.textContent === txt && el.children.length === 0);
            };
            const back = findByText('返回');
            if (back) {
                back.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                back.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                back.click();
                await new Promise((r) => setTimeout(r, 1000));
            }
            return { clicked: !!back, bodyText: document.body.innerText.slice(0, 150) };
        })()`,
    );

    // 播放链路探针:通过 musicfree-local:// 协议播放本地测试音频
    // (无头环境无音频设备,Chromium 走 null sink,但解码与播放时钟仍会推进)
    await probe(
        "playback-local",
        `(async () => {
            const audio = new Audio();
            audio.src = 'musicfree-local://p/' + encodeURIComponent('/tmp/test-tone.mp3');
            try {
                await audio.play();
            } catch (e) {
                return { played: false, error: String(e) };
            }
            await new Promise((r) => setTimeout(r, 2500));
            return {
                played: !audio.paused,
                currentTime: audio.currentTime,
                duration: audio.duration,
                readyState: audio.readyState,
                error: audio.error ? audio.error.code : null,
            };
        })()`,
    );

    // 播放结束清理
    await probe("playback-cleanup", `(function(){ const a = document.querySelector('audio'); if (a) { a.pause(); a.src=''; } return !!a; })()`);

    const img = await mainWindow!.webContents.capturePage();
    require("fs").writeFileSync("/tmp/mf-verify.png", img.toPNG());
    console.log("[verify] screenshot saved to /tmp/mf-verify.png");
    app.exit(0);
}

main().catch((e) => {
    console.error("[verify] fatal:", e);
    app.exit(1);
});
