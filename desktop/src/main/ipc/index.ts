/**
 * IPC 服务注册中心
 * 所有渲染进程桥接能力都经由 preload 的 contextBridge 走 IPC 到这里。
 */
import { app, BrowserWindow, ipcMain, webUtils, powerSaveBlocker, Notification } from "electron";
import * as path from "path";
import * as fs from "./fs-service";
import * as tag from "./tag-service";
import { loadMmkv, saveMmkv } from "./mmkv-service";

export interface IpcContext {
    getMainWindow: () => BrowserWindow | null;
    getLyricManager: () => any;
    getUserAgent: () => string;
    onLyricWindowCreated: (manager: any) => void;
}

let context: IpcContext | null = null;
let mprisService: { update: (partial: any) => void } | null = null;

export function setMprisService(service: { update: (partial: any) => void } | null) {
    mprisService = service;
}

/** 向所有窗口广播事件(open-url / 媒体键等) */
export function broadcastRendererEvent(channel: string, ...args: any[]) {
    for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
            win.webContents.send(`desktop-event:${channel}`, ...args);
        }
    }
}

export function registerIpcHandlers(ctx: IpcContext) {
    context = ctx;

    // ------------------------------------------------------------ 文件系统
    const fsApi = fs.createFsService();
    ipcMain.handle("fs:call", (_e, method: string, args: any[]) => {
        const fn = (fsApi as any)[method];
        if (typeof fn !== "function") {
            return Promise.reject(new Error(`fs method not found: ${method}`));
        }
        return fn(...args);
    });

    // ------------------------------------------------------------ MMKV
    ipcMain.on("mmkv:load", (event, storeId: string, dir: string) => {
        event.returnValue = loadMmkv(storeId, dir);
    });
    ipcMain.handle("mmkv:save", (_e, storeId: string, dir: string, data: any) => {
        saveMmkv(storeId, dir, data);
    });

    // ------------------------------------------------------------ 音乐标签
    ipcMain.handle("tag:call", (_e, method: string, args: any[]) => {
        const fn = (tag as any)[method];
        if (typeof fn !== "function") {
            return Promise.reject(new Error(`tag method not found: ${method}`));
        }
        return fn(...args);
    });

    // ------------------------------------------------------------ 选择器
    ipcMain.handle("dialog:pick-image", async () => {
        const { dialog } = await import("electron");
        const res = await dialog.showOpenDialog(getWindowForDialog(), {
            title: "选择图片",
            properties: ["openFile"],
            filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
        });
        if (res.canceled || res.filePaths.length === 0) return null;
        const filePath = res.filePaths[0];
        return {
            uri: webUtils.getPathForFile ? filePath : filePath,
            path: filePath,
            name: path.basename(filePath),
        };
    });

    ipcMain.handle("dialog:pick-file", async (_e, extensions?: string[]) => {
        const { dialog } = await import("electron");
        const res = await dialog.showOpenDialog(getWindowForDialog(), {
            title: "选择文件",
            properties: ["openFile"],
            filters: extensions?.length
                ? [{ name: "文件", extensions }]
                : undefined,
        });
        if (res.canceled || res.filePaths.length === 0) return null;
        return {
            uri: res.filePaths[0],
            path: res.filePaths[0],
            name: path.basename(res.filePaths[0]),
        };
    });

    ipcMain.handle("dialog:pick-directory", async () => {
        const { dialog } = await import("electron");
        const res = await dialog.showOpenDialog(getWindowForDialog(), {
            title: "选择文件夹",
            properties: ["openDirectory", "createDirectory"],
        });
        if (res.canceled || res.filePaths.length === 0) return null;
        return res.filePaths[0];
    });

    // ------------------------------------------------------------ 防休眠
    let sleepBlockerId: number | null = null;
    ipcMain.handle("power:prevent-sleep", () => {
        if (sleepBlockerId === null) {
            sleepBlockerId = powerSaveBlocker.start("prevent-display-sleep");
        }
    });
    ipcMain.handle("power:allow-sleep", () => {
        if (sleepBlockerId !== null) {
            powerSaveBlocker.stop(sleepBlockerId);
            sleepBlockerId = null;
        }
    });

    // ------------------------------------------------------------ 通知
    ipcMain.handle("notify", (_e, title: string, body?: string) => {
        if (!Notification.isSupported()) return;
        const notification = new Notification({
            title: title || "MusicFree",
            body: body ?? "",
            silent: true,
        });
        notification.show();
    });

    // ------------------------------------------------------------ 路径
    ipcMain.handle("paths:get", () => fs.getPaths());
    ipcMain.on("paths:get", (event) => {
        event.returnValue = fs.getPaths();
    });

    // ------------------------------------------------------------ MPRIS
    ipcMain.handle("mpris:update", (_e, partial: any) => {
        mprisService?.update(partial);
    });

    // ------------------------------------------------------------ 桌面歌词
    ipcMain.handle("lyric:show", async (_e, initLyric?: string, config?: any) => {
        let manager = ctx.getLyricManager();
        if (!manager) {
            const { LyricWindowManager } = await import("../lyric-window");
            manager = new LyricWindowManager();
            await manager.create();
            ctx.onLyricWindowCreated(manager);
        }
        await manager.show(initLyric, config);
        return true;
    });
    ipcMain.handle("lyric:hide", () => {
        ctx.getLyricManager()?.hide();
    });
    ipcMain.handle("lyric:set-text", (_e, text: string) => {
        ctx.getLyricManager()?.setText(text);
    });
    ipcMain.handle("lyric:set-config", (_e, partial: any) => {
        ctx.getLyricManager()?.updateConfig(partial);
    });

    function getWindowForDialog(): BrowserWindow {
        return ctx.getMainWindow() ?? (null as any);
    }
}

export function getIpcContext() {
    return context;
}

export { fs, tag };
