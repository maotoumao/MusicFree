/**
 * 桌面歌词悬浮窗(替代 Android 状态栏歌词)
 * 独立 frameless BrowserWindow,始终置顶、点击穿透可切换,
 * 渲染层为 dist/renderer/lyric.html。
 */
import { app, BrowserWindow, screen } from "electron";
import * as path from "path";

export interface LyricWindowConfig {
    top?: number; // 0-100 percent
    left?: number; // 0-100 percent
    width?: number; // 0-100 percent
    fontSize?: number;
    align?: number; // 3 left / 5 right / 17 center
    textColor?: string | null;
    backgroundColor?: string | null;
    clickThrough?: boolean;
}

const isDev = !app.isPackaged;
const rendererRoot = isDev
    ? path.resolve(__dirname, "../renderer")
    : path.resolve(__dirname, "../../renderer");

export class LyricWindowManager {
    private win: BrowserWindow | null = null;
    private visible = false;
    private config: LyricWindowConfig = {
        top: 88,
        left: 10,
        width: 80,
        fontSize: 24,
        align: 17,
        clickThrough: false,
    };
    private currentText = "";
    private pendingEvents: string[] = [];

    async create(): Promise<BrowserWindow> {
        if (this.win && !this.win.isDestroyed()) {
            return this.win;
        }
        const { width: screenWidth, height: screenHeight } =
            screen.getPrimaryDisplay().workAreaSize;

        this.win = new BrowserWindow({
            width: Math.round(screenWidth * (this.config.width ?? 80) / 100),
            height: Math.round((this.config.fontSize ?? 24) * 2.2),
            x: Math.round(screenWidth * (this.config.left ?? 10) / 100),
            y: Math.round(screenHeight * (this.config.top ?? 88) / 100),
            frame: false,
            transparent: true,
            resizable: false,
            alwaysOnTop: true,
            skipTaskbar: true,
            hasShadow: false,
            focusable: !this.config.clickThrough,
            show: false,
            webPreferences: {
                preload: path.resolve(__dirname, "../preload/preload.js"),
                contextIsolation: true,
                nodeIntegration: false,
            },
        });

        // 置顶层级:屏幕保护之上
        this.win.setAlwaysOnTop(true, "screen-saver");
        if (this.config.clickThrough) {
            this.win.setIgnoreMouseEvents(true, { forward: true });
        }

        this.win.loadFile(path.join(rendererRoot, "lyric.html"));

        this.win.webContents.once("did-finish-load", () => {
            this.pushConfig();
            this.pushText(this.currentText);
            if (this.visible) {
                this.win?.showInactive();
            }
        });

        this.win.on("closed", () => {
            this.win = null;
            this.visible = false;
        });

        return this.win;
    }

    async show(initLyric?: string, config?: Record<string, any>) {
        if (!this.win || this.win.isDestroyed()) {
            await this.create();
        }
        if (config) {
            this.config = { ...this.config, ...config };
        }
        if (initLyric !== undefined && initLyric !== null) {
            this.currentText = initLyric;
        }
        this.visible = true;
        this.pushConfig();
        this.pushText(this.currentText);
        this.win?.showInactive();
    }

    hide() {
        this.visible = false;
        this.win?.hide();
    }

    toggle() {
        if (this.visible) {
            this.hide();
        } else {
            this.show();
        }
    }

    isVisible() {
        return this.visible;
    }

    destroy() {
        if (this.win && !this.win.isDestroyed()) {
            this.win.destroy();
        }
        this.win = null;
        this.visible = false;
    }

    setText(text: string) {
        this.currentText = text;
        this.pushText(text);
    }

    updateConfig(partial: LyricWindowConfig) {
        this.config = { ...this.config, ...partial };
        const win = this.win;
        if (!win || win.isDestroyed()) return;

        const { width: screenWidth, height: screenHeight } =
            screen.getPrimaryDisplay().workAreaSize;
        if (partial.top !== undefined || partial.left !== undefined) {
            win.setPosition(
                Math.round(screenWidth * (this.config.left ?? 10) / 100),
                Math.round(screenHeight * (this.config.top ?? 88) / 100),
            );
        }
        if (partial.width !== undefined) {
            win.setSize(
                Math.round(screenWidth * this.config.width! / 100),
                Math.round((this.config.fontSize ?? 24) * 2.2),
            );
        }
        if (partial.clickThrough !== undefined) {
            win.setIgnoreMouseEvents(partial.clickThrough, { forward: true });
            win.setFocusable(!partial.clickThrough);
        }
        this.pushConfig();
    }

    private pushConfig() {
        this.win?.webContents.send("lyric:update-config", this.config);
    }

    private pushText(text: string) {
        this.win?.webContents.send("lyric:update-text", text);
    }

    getWindow() {
        return this.win;
    }
}
