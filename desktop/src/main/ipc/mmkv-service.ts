/**
 * MMKV 存储服务(桌面实现)
 * 以 JSON 文件持久化,渲染进程通过 sendSync 全量加载、异步防抖保存。
 * 文件布局与移动端 mmkv 目录一致:{mmkvPath}/{id}.mmkv
 */
import * as fs from "fs";
import * as path from "path";
import { app } from "electron";

export type MmkvData = Record<string, string>;

const loaded = new Map<string, MmkvData>();

function resolveDir(dir: string): string {
    if (path.isAbsolute(dir)) return dir;
    return path.join(app.getPath("userData"), "data", dir);
}

function resolveFile(storeId: string, dir: string): string {
    const safeId = storeId.replace(/[^a-zA-Z0-9._-]/g, "_");
    return path.join(resolveDir(dir), `${safeId}.mmkv`);
}

export function loadMmkv(storeId: string, dir: string): MmkvData {
    const key = `${resolveDir(dir)}/${storeId}`;
    const cached = loaded.get(key);
    if (cached) return cached;

    const file = resolveFile(storeId, dir);
    let data: MmkvData = {};
    try {
        data = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        // 文件不存在或损坏,从备份恢复
        try {
            data = JSON.parse(fs.readFileSync(`${file}.bak`, "utf8"));
        } catch {
            data = {};
        }
    }
    loaded.set(key, data);
    return data;
}

export function saveMmkv(storeId: string, dir: string, data: MmkvData): void {
    const key = `${resolveDir(dir)}/${storeId}`;
    loaded.set(key, data);
    const file = resolveFile(storeId, dir);
    try {
        fs.mkdirSync(dir, { recursive: true });
        // 简单的写前备份,降低写坏风险
        if (fs.existsSync(file)) {
            try {
                fs.copyFileSync(file, `${file}.bak`);
            } catch {
                // 忽略备份失败
            }
        }
        const tmp = `${file}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(data), "utf8");
        fs.renameSync(tmp, file);
    } catch (err) {
        console.warn("[mmkv] save failed:", storeId, err);
    }
}
