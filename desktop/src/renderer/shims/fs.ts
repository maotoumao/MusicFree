/**
 * react-native-fs 桌面实现
 * 全部操作经 IPC 转发到主进程 Node.js fs;
 * downloadFile 在渲染进程以 fetch 流式实现,保证进度回调语义。
 */
declare global {
    interface Window {
        __MUSICFREE_DESKTOP__?: any;
    }
}

const bridge = window.__MUSICFREE_DESKTOP__;

// 路径常量需要同步可用(pathConst.ts 在模块初始化时读取)
const paths: Record<string, string> = bridge
    ? bridge.fs.getPathsSync()
    : {};

export const DocumentDirectoryPath = paths.DocumentDirectoryPath ?? "";
export const ExternalDirectoryPath = paths.ExternalDirectoryPath ?? "";
export const ExternalStorageDirectoryPath =
    paths.ExternalStorageDirectoryPath ?? "/";
export const ExternalCachesDirectoryPath =
    paths.ExternalCachesDirectoryPath ?? "";
export const CachesDirectoryPath = paths.CachesDirectoryPath ?? "";
export const TemporaryDirectoryPath = paths.TemporaryDirectoryPath ?? "";
export const LibraryDirectoryPath = paths.LibraryDirectoryPath ?? "";
export const PicturesDirectoryPath = paths.PicturesDirectoryPath ?? "";
export const DownloadDirectoryPath = paths.DownloadDirectoryPath ?? "";
export const MainBundlePath = paths.MainBundlePath ?? "";

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
    originalFilepath: string;
    path: string;
    isFile: () => boolean;
    isDirectory: () => boolean;
}

export interface DownloadFileOptions {
    fromUrl: string;
    toFile: string;
    headers?: Record<string, string>;
    background?: boolean;
    progressInterval?: number;
    progressDivider?: number;
    begin?: (res: {
        jobId: number;
        statusCode: number;
        contentLength: number;
        headers: any;
    }) => void;
    progress?: (res: {
        jobId: number;
        contentLength: number;
        bytesWritten: number;
    }) => void;
}

export interface DownloadResult {
    jobId: number;
    statusCode: number;
    bytesWritten: number;
}

const fsApi = {
    mkdir: (filepath: string): Promise<void> =>
        bridge.fs.mkdir(filepath),
    exists: (filepath: string): Promise<boolean> =>
        bridge.fs.exists(filepath),
    readFile: (
        filepath: string,
        encoding?: "utf8" | "base64" | "ascii",
    ): Promise<string> => bridge.fs.readFile(filepath, encoding),
    read: (
        filepath: string,
        length = 0,
        position = 0,
    ): Promise<string> => bridge.fs.read(filepath, length, position),
    writeFile: (
        filepath: string,
        content: string,
        encoding?: "utf8" | "base64" | "ascii",
    ): Promise<void> => bridge.fs.writeFile(filepath, content, encoding),
    appendFile: (
        filepath: string,
        content: string,
        encoding?: "utf8" | "base64",
    ): Promise<void> => bridge.fs.appendFile(filepath, content, encoding),
    write: (
        filepath: string,
        contents: string,
        position = 0,
        encoding?: "utf8" | "base64",
    ): Promise<number> => bridge.fs.write(filepath, contents, position, encoding),
    readDir: (filepath: string): Promise<ReadDirItem[]> =>
        bridge.fs.readDir(filepath),
    readdir: (filepath: string): Promise<string[]> =>
        bridge.fs.readdir(filepath),
    stat: (filepath: string): Promise<StatResult> =>
        bridge.fs.stat(filepath),
    unlink: (filepath: string): Promise<void> => bridge.fs.unlink(filepath),
    copyFile: (from: string, to: string): Promise<void> =>
        bridge.fs.copyFile(from, to),
    moveFile: (from: string, to: string): Promise<void> =>
        bridge.fs.moveFile(from, to),
    touch: (
        filepath: string,
        mtime?: Date,
        ctime?: Date,
    ): Promise<void> =>
        bridge.fs.touch(
            filepath,
            mtime?.getTime?.(),
            ctime?.getTime?.(),
        ),
    getAllExternalFilesDirs: (): Promise<string[]> =>
        bridge.fs.getAllExternalFilesDirs(),
    getFSInfo: (): Promise<{ totalSpace: number; freeSpace: number }> =>
        bridge.fs.getFSInfo(),
};

// ---------------------------------------------------------------- downloadFile
let downloadJobCounter = 0;

export function downloadFile(options: DownloadFileOptions): {
    jobId: number;
    promise: Promise<DownloadResult>;
    abort: () => void;
} {
    const jobId = ++downloadJobCounter;
    const controller = new AbortController();

    const promise = (async (): Promise<DownloadResult> => {
        let bytesWritten = 0;
        let statusCode = 200;
        try {
            const resp = await fetch(options.fromUrl, {
                headers: options.headers,
                signal: controller.signal,
            });
            statusCode = resp.status;
            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }
            const contentLength = Number(
                resp.headers.get("content-length") ?? 0,
            );
            options.begin?.({
                jobId,
                statusCode: resp.status,
                contentLength,
                headers: resp.headers,
            });

            const toFile = options.toFile.startsWith("file://")
                ? decodeURIComponent(options.toFile.slice("file://".length))
                : options.toFile;

            const reader = resp.body?.getReader();
            if (!reader) {
                const buf = new Uint8Array(await resp.arrayBuffer());
                await fsApi.writeFile(toFile, toBase64(buf), "base64");
                bytesWritten = buf.length;
                options.progress?.({ jobId, contentLength, bytesWritten });
                return { jobId, statusCode, bytesWritten };
            }

            let pending: Uint8Array[] = [];
            let pendingSize = 0;
            let first = true;

            const flush = async (isEnd: boolean) => {
                if (pendingSize === 0 && !isEnd) return;
                const merged = concat(pending, pendingSize);
                pending = [];
                pendingSize = 0;
                const b64 = toBase64(merged);
                if (first) {
                    await fsApi.writeFile(toFile, b64, "base64");
                    first = false;
                } else {
                    await fsApi.appendFile(toFile, b64, "base64");
                }
            };

            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value?.length) {
                    pending.push(value);
                    pendingSize += value.length;
                    bytesWritten += value.length;
                    // 每 512KB 落盘一次
                    if (pendingSize >= 512 * 1024) {
                        await flush(false);
                    }
                }
                options.progress?.({ jobId, contentLength, bytesWritten });
            }
            await flush(true);
            return { jobId, statusCode, bytesWritten };
        } catch (e: any) {
            if (e?.name === "AbortError") {
                throw new Error("Download has been aborted");
            }
            throw e;
        }
    })();

    return {
        jobId,
        promise,
        abort: () => controller.abort(),
    };
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
        out.set(c, offset);
        offset += c.length;
    }
    return out;
}

function toBase64(buf: Uint8Array): string {
    let binary = "";
    const step = 0x8000;
    for (let i = 0; i < buf.length; i += step) {
        binary += String.fromCharCode(...buf.subarray(i, i + step));
    }
    return btoa(binary);
}

export function uploadFile(_options: any) {
    return Promise.reject(new Error("uploadFile is not supported on desktop"));
}

// ---------------------------------------------------------------- 默认导出
const RNFS = {
    ...fsApi,
    downloadFile,
    uploadFile,
    DocumentDirectoryPath,
    ExternalDirectoryPath,
    ExternalStorageDirectoryPath,
    ExternalCachesDirectoryPath,
    CachesDirectoryPath,
    TemporaryDirectoryPath,
    LibraryDirectoryPath,
    PicturesDirectoryPath,
    DownloadDirectoryPath,
    MainBundlePath,
};

export default RNFS;

// 命名导出(RNFS 的具名 API)
export const {
    mkdir,
    exists,
    readFile,
    read,
    writeFile,
    appendFile,
    write,
    readDir,
    readdir,
    stat,
    unlink,
    copyFile,
    moveFile,
    touch,
    getAllExternalFilesDirs,
    getFSInfo,
} = fsApi as any;
