/** 共享存储：app 与系统文件域之间的互操作（交付出去 / 定位交进来的 URI） */
import NativeSharedStorage from '@/native/specs/NativeSharedStorage';

/**
 * 把文件另存到系统「下载」目录，返回其在系统中的 URI
 * 同名自动改名而非覆盖；Android 9 及以下依赖已授予的存储权限，未授予则抛出
 */
export function saveToDownloads(
    sourcePath: string,
    fileName: string,
    mimeType: string,
): Promise<string> {
    return NativeSharedStorage.saveToDownloads(sourcePath, fileName, mimeType);
}

/**
 * 找出 fileLocation 背后可直接读取的本地路径；定位不到一律 null
 * 桥故障原样传播，由 core 决定记录与降级
 */
export async function findReadableFilePath(
    fileLocation: string,
): Promise<string | null> {
    const path = await NativeSharedStorage.findReadableFilePath(fileLocation);
    return path || null;
}
