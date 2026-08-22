/**
 * 系统托盘:播放控制 + 显示/隐藏 + 桌面歌词开关 + 退出
 * 托盘图标:无原生图标资源时使用 1x1 透明占位,避免打包前崩溃。
 */
import { app, Menu, Tray, nativeImage, BrowserWindow } from "electron";
import * as path from "path";
import { broadcastRendererEvent } from "./ipc";

export interface TrayOptions {
    getWindow: () => BrowserWindow | null;
    onQuit: () => void;
    onShowLyric: () => void;
}

let tray: Tray | null = null;

function resolveTrayIcon(): Electron.NativeImage {
    const isDev = !app.isPackaged;
    const iconPath = isDev
        ? path.resolve(__dirname, "../../assets/icon.png")
        : path.resolve(process.resourcesPath, "icon.png");
    let image: Electron.NativeImage;
    try {
        image = nativeImage.createFromPath(iconPath);
        if (image.isEmpty()) throw new Error("empty");
    } catch {
        image = nativeImage.createEmpty();
    }
    // 托盘尺寸缩放
    if (!image.isEmpty()) {
        image = image.resize({ width: 32, height: 32 });
    }
    return image;
}

export function createTray(options: TrayOptions) {
    if (tray) return tray;

    tray = new Tray(resolveTrayIcon());
    tray.setToolTip("MusicFree");

    const rebuild = () => {
        const menu = Menu.buildFromTemplate([
            {
                label: "播放/暂停",
                click: () => broadcastRendererEvent("media-control", "playpause"),
            },
            {
                label: "上一曲",
                click: () => broadcastRendererEvent("media-control", "previous"),
            },
            {
                label: "下一曲",
                click: () => broadcastRendererEvent("media-control", "next"),
            },
            { type: "separator" },
            {
                label: "显示主窗口",
                click: () => {
                    const win = options.getWindow();
                    if (win) {
                        win.show();
                        win.focus();
                    }
                },
            },
            {
                label: "桌面歌词",
                click: () => options.onShowLyric(),
            },
            { type: "separator" },
            {
                label: "退出",
                click: () => options.onQuit(),
            },
        ]);
        tray?.setContextMenu(menu);
    };

    rebuild();

    tray.on("click", () => {
        const win = options.getWindow();
        if (!win) return;
        if (win.isVisible() && win.isFocused()) {
            win.hide();
        } else {
            win.show();
            win.focus();
        }
    });

    return tray;
}

export function destroyTray() {
    tray?.destroy();
    tray = null;
}

export function getTray() {
    return tray;
}
