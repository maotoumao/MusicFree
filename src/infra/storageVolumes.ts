/**
 * 设备外部存储卷（内置共享存储 + SD 卡等可移动卷）：领域无关的平台能力
 * 卷会插拔，故每次要用都现问系统、此层不缓存；「记住见过哪些卷」是业务判断，归调用方
 */
import { os } from '@/infra/device';
import systemGates from '@/infra/systemGates';
import { stripTrailingSlash } from '@/utils/path';

import type { StorageVolumeInfo } from '@/native/specs/NativeSystem';

export type StorageVolume = StorageVolumeInfo;

/**
 * 主共享存储根：Android 上恒定如此
 * 卷列表拿不到时的兜底——扫描/浏览宁可只认内置存储，也不能一个根都没有
 */
export const PRIMARY_STORAGE_ROOT = '/storage/emulated/0';

/**
 * 枚举外部存储卷；非 Android 恒空数组，桥故障原样抛出
 * 原生只报能定位到根目录的卷，故未挂载的卷可能整个缺席
 * 内部实现：对外只出下面两个吞错版本——没有调用方想为「拿不到卷」写各自的降级
 */
async function getStorageVolumes(): Promise<readonly StorageVolume[]> {
    if (os !== 'android') {
        return []; // iOS 只有 app 沙盒（原生空壳也回空数组，这里省一趟过桥）
    }
    const volumes = await systemGates.getStorageVolumes();
    // 先规范化再过滤：反过来 '//' 会通过长度检查、再被规范成空串，
    // 而空路径是「谁都在它之下」的万能前缀，会架空扫描侧的删除护栏
    return volumes
        .map(v => ({ ...v, path: stripTrailingSlash(v.path) }))
        .filter(v => v.path.length > 0);
}

/**
 * 此刻可读的卷（扫描 / 浏览的共同口径）；取不到一律空数组，不向上抛
 * 「什么算可读」只在这一处判定——散在各调用方 filter 会各自漂移
 */
export async function getMountedVolumes(): Promise<readonly StorageVolume[]> {
    try {
        return (await getStorageVolumes()).filter(v => v.isMounted);
    } catch {
        return [];
    }
}

/** 此刻可读的卷根路径（只要路径的调用方用它，别再各自 filter+map） */
export async function getMountedVolumeRoots(): Promise<readonly string[]> {
    return (await getMountedVolumes()).map(v => v.path);
}
