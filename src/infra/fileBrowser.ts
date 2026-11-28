/**
 * 应用内目录浏览：rn-fs 列子目录 + 枚举存储根（选扫描目录 / 下载目录用）
 * 纯文件系统浏览，不懂任何业务库——故属 infra，页面可直连
 */
import { readDir } from '@dr.pogodin/react-native-fs';

import {
    PRIMARY_STORAGE_ROOT,
    getMountedVolumes,
} from '@/infra/storageVolumes';

/** 目录浏览的一项（仅目录 / 存储根） */
export interface DirEntry {
    /** 展示名：子目录=真实目录名；存储根=系统给的卷名（可能为空串，兜底文案由 UI 定） */
    name: string;
    path: string;
    /** 仅存储根项带：卷身份，供 UI 选图标与兜底名——别拿 name 反推是哪种存储 */
    volume?: { isPrimary: boolean; isRemovable: boolean };
}

/** 列子目录（仅目录、按名称升序）；读失败（无权限/路径不存在）返回空 */
export async function listDirectories(
    path: string,
): Promise<readonly DirEntry[]> {
    let entries;
    try {
        entries = await readDir(path);
    } catch {
        return [];
    }
    const dirs: DirEntry[] = [];
    for (const entry of entries) {
        if (entry.isDirectory()) {
            dirs.push({ name: entry.name, path: entry.path });
        }
    }
    dirs.sort((a, b) => a.name.localeCompare(b.name));
    return dirs;
}

/**
 * 内置存储入口：系统没报主存储时补上（浏览器不能没有内置存储这条路）
 * 冻结：它会被原样放进返回数组，调用方共享同一引用
 */
const PRIMARY_ROOT_ENTRY: DirEntry = Object.freeze({
    name: '',
    path: PRIMARY_STORAGE_ROOT,
    volume: Object.freeze({ isPrimary: true, isRemovable: false }),
});

/**
 * 目录浏览器入口：已挂载的存储根（内置 + SD 卡等）
 * 内置存储恒在：桥故障、系统只报了 SD 卡等情形下都要补齐——
 * 否则用户会连内置存储的目录都选不了，而扫描侧照样在扫它（两侧口径不能背离）
 */
export async function getStorageRoots(): Promise<readonly DirEntry[]> {
    const roots = (await getMountedVolumes()).map(v => ({
        name: v.name,
        path: v.path,
        volume: { isPrimary: v.isPrimary, isRemovable: v.isRemovable },
    }));
    return roots.some(
        r => r.volume.isPrimary || r.path === PRIMARY_STORAGE_ROOT,
    )
        ? roots
        : [PRIMARY_ROOT_ENTRY, ...roots];
}
