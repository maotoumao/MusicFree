/**
 * preload 桥:渲染进程唯一的主进程入口
 * 通过 contextBridge 暴露 window.__MUSICFREE_DESKTOP__
 */
import { contextBridge, ipcRenderer } from "electron";

type Listener = (...args: any[]) => void;

const invokeFs = (method: string, ...args: any[]) =>
    ipcRenderer.invoke("fs:call", method, args);
const invokeTag = (method: string, ...args: any[]) =>
    ipcRenderer.invoke("tag:call", method, args);

const bridge = {
    // -------------------------------------------------- 文件系统(RNFS 等价)
    fs: {
        getPaths: () => ipcRenderer.invoke("paths:get"),
        /** 同步获取路径(渲染进程模块初始化时使用) */
        getPathsSync: () => ipcRenderer.sendSync("paths:get"),
        mkdir: (p: string) => invokeFs("mkdir", p),
        exists: (p: string) => invokeFs("exists", p),
        readFile: (p: string, encoding?: string) =>
            invokeFs("readFile", p, encoding),
        read: (p: string, length?: number, position?: number) =>
            invokeFs("read", p, length, position),
        writeFile: (p: string, content: string, encoding?: string) =>
            invokeFs("writeFile", p, content, encoding),
        appendFile: (p: string, content: string, encoding?: string) =>
            invokeFs("appendFile", p, content, encoding),
        write: (p: string, contents: string, position?: number, encoding?: string) =>
            invokeFs("write", p, contents, position, encoding),
        readDir: (p: string) => invokeFs("readDir", p),
        readdir: (p: string) => invokeFs("readdir", p),
        stat: (p: string) => invokeFs("stat", p),
        unlink: (p: string) => invokeFs("unlink", p),
        copyFile: (from: string, to: string) =>
            invokeFs("copyFile", from, to),
        moveFile: (from: string, to: string) =>
            invokeFs("moveFile", from, to),
        touch: (p: string, mtime?: number, ctime?: number) =>
            invokeFs("touch", p, mtime, ctime),
        getAllExternalFilesDirs: () => invokeFs("getAllExternalFilesDirs"),
        getFSInfo: () => invokeFs("getFSInfo"),
    },

    // -------------------------------------------------- MMKV 存储
    mmkv: {
        /** 同步加载(渲染进程 MMKV 构造时调用) */
        load: (storeId: string, dir: string) =>
            ipcRenderer.sendSync("mmkv:load", storeId, dir) as Record<
                string,
                string
            >,
        save: (storeId: string, dir: string, data: Record<string, string>) =>
            ipcRenderer.invoke("mmkv:save", storeId, dir, data),
    },

    // -------------------------------------------------- 音乐标签(Mp3Util)
    tag: {
        getBasicMeta: (fileName: string) =>
            invokeTag("getBasicMeta", fileName),
        getMediaMeta: (fileNames: string[]) =>
            invokeTag("getMediaMeta", fileNames),
        getMediaCoverImg: (mediaPath: string) =>
            invokeTag("getMediaCoverImg", mediaPath),
        getLyric: (mediaPath: string) => invokeTag("getLyric", mediaPath),
        setMediaTag: (filePath: string, meta: any) =>
            invokeTag("setMediaTag", filePath, meta),
        getMediaTag: (filePath: string) =>
            invokeTag("getMediaTag", filePath),
    },

    // -------------------------------------------------- 桌面歌词(LyricUtil)
    lyric: {
        show: (initLyric?: string, config?: any) =>
            ipcRenderer.invoke("lyric:show", initLyric, config),
        hide: () => ipcRenderer.invoke("lyric:hide"),
        setText: (text: string) => ipcRenderer.invoke("lyric:set-text", text),
        setConfig: (partial: any) =>
            ipcRenderer.invoke("lyric:set-config", partial),
        /** 歌词窗口内部使用 */
        onLyricUpdate: (cb: Listener) => {
            ipcRenderer.on("lyric:update-text", (_e, text) => cb(text));
        },
        onLyricConfig: (cb: Listener) => {
            ipcRenderer.on("lyric:update-config", (_e, config) => cb(config));
        },
    },

    // -------------------------------------------------- 选择器
    dialog: {
        pickImage: () => ipcRenderer.invoke("dialog:pick-image"),
        pickFile: (extensions?: string[]) =>
            ipcRenderer.invoke("dialog:pick-file", extensions),
        pickDirectory: () => ipcRenderer.invoke("dialog:pick-directory"),
    },

    // -------------------------------------------------- 应用
    app: {
        quit: () => ipcRenderer.invoke("app:quit"),
        minimize: () => ipcRenderer.invoke("app:minimize"),
        hide: () => ipcRenderer.invoke("app:hide"),
        isQuiting: () => ipcRenderer.invoke("app:is-quiting"),
        setCloseBehavior: (toTray: boolean) =>
            ipcRenderer.invoke("app:set-close-behavior", toTray),
        openExternal: (url: string) =>
            ipcRenderer.invoke("app:open-external", url),
        getVersion: () => ipcRenderer.invoke("app:version"),
        /** 首次启动携带的深链 URL(musicfree://...) */
        getInitialURL: () => ipcRenderer.invoke("app:get-initial-url"),
        notify: (title: string, body?: string) =>
            ipcRenderer.invoke("notify", title, body),
        preventSleep: () => ipcRenderer.invoke("power:prevent-sleep"),
        allowSleep: () => ipcRenderer.invoke("power:allow-sleep"),
    },

    // -------------------------------------------------- MPRIS 状态推送
    mpris: {
        update: (partial: any) => ipcRenderer.invoke("mpris:update", partial),
    },

    // -------------------------------------------------- 事件订阅
    events: {
        /** 订阅主进程广播事件,返回取消函数 */
        on: (channel: string, cb: Listener) => {
            const wrapped = (_e: any, ...args: any[]) => cb(...args);
            ipcRenderer.on(`desktop-event:${channel}`, wrapped);
            return () => {
                ipcRenderer.removeListener(
                    `desktop-event:${channel}`,
                    wrapped,
                );
            };
        },
    },
};

contextBridge.exposeInMainWorld("__MUSICFREE_DESKTOP__", bridge);

export type DesktopBridge = typeof bridge;
