/**
 * react-native-fs 的桌面(Node.js)实现
 * 所有方法接受绝对路径或 file:// 路径,返回值与 RNFS 语义保持一致。
 */
import { app } from "electron";
import * as path from "path";
import * as fs from "fs";

/** 去掉 file:// 前缀 */
function normalize(p: string): string {
    if (typeof p !== "string") return p;
    if (p.startsWith("file://")) {
        return decodeURIComponent(p.slice("file://".length));
    }
    return p;
}

export interface ReadDirItem {
    ctime: Date | null;
    mtime: Date | null;
    name: string;
    path: string;
    size: number;
    isFile: () => boolean;
    isDirectory: () => boolean;
}

export interface StatResult {
    ctime: Date | null;
    mtime: Date | null;
    size: number;
    mode: number;
    isFile: () => boolean;
    isDirectory: () => boolean;
    path: string;
    originalFilepath: string;
}

export function getPaths() {
    const userData = app.getPath("userData");
    const basePath = path.join(userData, "data");
    return {
        basePath,
        DocumentDirectoryPath: basePath,
        ExternalDirectoryPath: basePath,
        ExternalStorageDirectoryPath: "/", // 桌面端允许浏览整个文件系统
        ExternalCachesDirectoryPath: path.join(userData, "cache"),
        CachesDirectoryPath: path.join(userData, "cache"),
        TemporaryDirectoryPath: app.getPath("temp") || path.join(userData, "cache", "tmp"),
        LibraryDirectoryPath: path.join(userData, "library"),
        PicturesDirectoryPath: app.getPath("pictures") || path.join(app.getPath("home"), "Pictures"),
        DownloadDirectoryPath: app.getPath("downloads") || path.join(app.getPath("home"), "Downloads"),
        MainBundlePath: path.dirname(app.getAppPath()),
    };
}

export function createFsService() {
    return {
        getPaths,

        async mkdir(filepath: string): Promise<void> {
            await fs.promises.mkdir(normalize(filepath), { recursive: true });
        },

        async exists(filepath: string): Promise<boolean> {
            try {
                await fs.promises.access(normalize(filepath));
                return true;
            } catch {
                return false;
            }
        },

        async readFile(
            filepath: string,
            encoding?: "utf8" | "base64" | "ascii",
        ): Promise<string> {
            const buf = await fs.promises.readFile(normalize(filepath));
            if (encoding === "base64") {
                return buf.toString("base64");
            }
            return buf.toString("utf8");
        },

        async read(filepath: string, length = 0, position = 0): Promise<string> {
            const fd = await fs.promises.open(normalize(filepath), "r");
            try {
                const buf = Buffer.alloc(length);
                const { bytesRead } = await fd.read(buf, 0, length, position);
                return buf.subarray(0, bytesRead).toString("base64");
            } finally {
                await fd.close();
            }
        },

        async writeFile(
            filepath: string,
            content: string,
            encoding?: "utf8" | "base64" | "ascii",
        ): Promise<void> {
            const target = normalize(filepath);
            await fs.promises.mkdir(path.dirname(target), { recursive: true });
            const data =
                encoding === "base64"
                    ? Buffer.from(content, "base64")
                    : Buffer.from(content, "utf8");
            await fs.promises.writeFile(target, data);
        },

        async appendFile(
            filepath: string,
            content: string,
            encoding?: "utf8" | "base64",
        ): Promise<void> {
            const target = normalize(filepath);
            await fs.promises.mkdir(path.dirname(target), { recursive: true });
            const data =
                encoding === "base64"
                    ? Buffer.from(content, "base64")
                    : Buffer.from(content, "utf8");
            await fs.promises.appendFile(target, data);
        },

        async write(
            filepath: string,
            contents: string,
            position = 0,
            encoding?: "utf8" | "base64",
        ): Promise<number> {
            const target = normalize(filepath);
            const data =
                encoding === "base64"
                    ? Buffer.from(contents, "base64")
                    : Buffer.from(contents, "utf8");
            const fd = await fs.promises.open(target, "r+");
            try {
                const { bytesWritten } = await fd.write(
                    data,
                    0,
                    data.length,
                    position,
                );
                return bytesWritten;
            } finally {
                await fd.close();
            }
        },

        async readDir(filepath: string): Promise<ReadDirItem[]> {
            const dir = normalize(filepath);
            const entries = await fs.promises.readdir(dir, {
                withFileTypes: true,
            });
            const result: ReadDirItem[] = [];
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                let stat: fs.Stats | null = null;
                try {
                    stat = await fs.promises.stat(fullPath);
                } catch {
                    // 无权限等场景
                }
                const isFile = entry.isFile();
                const isDir = entry.isDirectory();
                result.push({
                    name: entry.name,
                    path: fullPath,
                    size: stat?.size ?? 0,
                    ctime: stat?.ctime ?? null,
                    mtime: stat?.mtime ?? null,
                    isFile: () => isFile,
                    isDirectory: () => isDir,
                });
            }
            return result;
        },

        async readdir(filepath: string): Promise<string[]> {
            const items = await this.readDir(filepath);
            return items.map((it) => it.name);
        },

        async stat(filepath: string): Promise<StatResult> {
            const target = normalize(filepath);
            const stat = await fs.promises.stat(target);
            const isFile = stat.isFile();
            const isDir = stat.isDirectory();
            return {
                ctime: stat.ctime,
                mtime: stat.mtime,
                size: stat.size,
                mode: stat.mode,
                path: target,
                originalFilepath: target,
                isFile: () => isFile,
                isDirectory: () => isDir,
            };
        },

        async unlink(filepath: string): Promise<void> {
            const target = normalize(filepath);
            await fs.promises.rm(target, { force: true, recursive: true });
        },

        async copyFile(from: string, to: string): Promise<void> {
            const src = normalize(from);
            const dest = normalize(to);
            await fs.promises.mkdir(path.dirname(dest), { recursive: true });
            await fs.promises.copyFile(src, dest);
        },

        async moveFile(from: string, to: string): Promise<void> {
            const src = normalize(from);
            const dest = normalize(to);
            await fs.promises.mkdir(path.dirname(dest), { recursive: true });
            await fs.promises.rename(src, dest);
        },

        async touch(
            filepath: string,
            mtime?: Date,
            ctime?: Date,
        ): Promise<void> {
            const target = normalize(filepath);
            // 仅确保文件存在
            const fd = await fs.promises.open(target, "a");
            await fd.close();
            if (mtime) {
                await fs.promises.utimes(target, mtime, ctime ?? mtime);
            }
        },

        async getAllExternalFilesDirs(): Promise<string[]> {
            return [getPaths().CachesDirectoryPath];
        },

        async getFSInfo(): Promise<{ totalSpace: number; freeSpace: number }> {
            const stat = await fs.promises.statfs(
                getPaths().CachesDirectoryPath,
            );
            return {
                totalSpace: Number(stat.blocks) * Number(stat.bsize),
                freeSpace: Number(stat.bavail) * Number(stat.bsize),
            };
        },
    };
}
