/**
 * expo-file-system 桌面端实现
 * 项目内仅用到 readAsStringAsync / copyAsync / deleteAsync / getInfoAsync,
 * 基于 RNFS shim(IPC 文件服务)实现。
 */
import RNFS from "./fs";

const encodings = {
    UTF8: "utf8",
    Base64: "base64",
} as const;

async function readAsStringAsync(
    uri: string,
    options?: { encoding?: string },
): Promise<string> {
    return RNFS.readFile(uri, options?.encoding ?? "utf8");
}

async function writeAsStringAsync(
    uri: string,
    content: string,
    options?: { encoding?: string },
): Promise<void> {
    return RNFS.writeFile(uri, content, options?.encoding ?? "utf8");
}

async function copyAsync(options: { from: string; to: string }): Promise<void> {
    return RNFS.copyFile(options.from, options.to);
}

async function deleteAsync(
    uri: string,
    options?: { idempotent?: boolean },
): Promise<void> {
    try {
        await RNFS.unlink(uri);
    } catch (e: any) {
        if (options?.idempotent && e?.code === "ENOENT") return;
        throw e;
    }
}

interface FileInfo {
    exists: boolean;
    uri: string;
    size?: number;
    modificationTime?: number;
    isDirectory?: boolean;
    isFile?: boolean;
}

async function getInfoAsync(uri: string): Promise<FileInfo> {
    try {
        const stat = await RNFS.stat(uri);
        return {
            exists: true,
            uri,
            size: stat.size,
            modificationTime: stat.mtime ? stat.mtime.getTime() / 1000 : undefined,
            isDirectory: stat.isDirectory(),
            isFile: stat.isFile(),
        };
    } catch {
        return { exists: false, uri };
    }
}

async function makeDirectoryAsync(
    uri: string,
    options?: { intermediates?: boolean },
): Promise<void> {
    return RNFS.mkdir(uri);
}

async function readDirectoryAsync(uri: string): Promise<string[]> {
    return RNFS.readdir(uri);
}

export default {
    // expo 的 documentDirectory 以 file:// 开头,桌面端直接给绝对路径
    documentDirectory: "",
    cacheDirectory: "",
    EncodingType: encodings,
    readAsStringAsync,
    writeAsStringAsync,
    copyAsync,
    deleteAsync,
    getInfoAsync,
    makeDirectoryAsync,
    readDirectoryAsync,
};

export {
    readAsStringAsync,
    writeAsStringAsync,
    copyAsync,
    deleteAsync,
    getInfoAsync,
    makeDirectoryAsync,
    readDirectoryAsync,
};
