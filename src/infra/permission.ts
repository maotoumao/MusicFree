/**
 * 存储访问权限门面：按 Android 版本分派——R+（API 30+）走全文件访问（MANAGE_EXTERNAL_STORAGE）、
 * ≤10（API 24-29）走运行时读/写存储权限（react-native-permissions）；统一成状态给上层
 * 读（扫描本地曲库）+ 写（删原文件）：R+ 全文件访问读写一体；≤10 READ / WRITE 分别请求（同 STORAGE 组、授一自动授另一）
 * 领域无关机制：任何读写设备存储的功能都用，不含业务概念
 */
import { Platform } from 'react-native';
import {
    PERMISSIONS,
    RESULTS,
    check,
    openSettings,
    request,
} from 'react-native-permissions';

import systemGates from '@/infra/systemGates';

/** 存储读访问态：granted=可读；denied=未授予、可再请求；blocked=永久拒绝、需去系统设置 */
export type StorageAccessStatus = 'granted' | 'denied' | 'blocked';

// Android 11（R, API 30）起走全文件访问；此前走运行时读存储权限。非 Android 无此概念
const isAndroid = Platform.OS === 'android';
const usesAllFilesAccess = isAndroid && Number(Platform.Version) >= 30;

function fromResult(status: string): StorageAccessStatus {
    if (status === RESULTS.GRANTED) return 'granted';
    if (status === RESULTS.BLOCKED) return 'blocked'; // 仅 request() 可能返回；check() 永久拒绝也只给 denied
    return 'denied'; // denied / unavailable / limited 一律当未授予
}

/** 查读存储访问：R+ 判全文件访问 / ≤10 查 READ_EXTERNAL_STORAGE。注意 Android check 不产 blocked（那是 request 后才知） */
export async function checkStorageReadAccess(): Promise<StorageAccessStatus> {
    if (!isAndroid) return 'denied'; // 本地存储扫描仅 Android
    if (usesAllFilesAccess) {
        return (await systemGates.isAllFilesAccessGranted())
            ? 'granted'
            : 'denied';
    }
    return fromResult(await check(PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE));
}

/**
 * 请求读存储访问：已授予直接返回（不重复打扰）
 * R+ 跳系统设置页 → 返回即时快照（通常仍 denied，非最终态，靠调用方回前台复检收敛）
 * ≤10 弹标准运行时权限窗 → 同步返回结果（可能 blocked）
 */
export async function requestStorageReadAccess(): Promise<StorageAccessStatus> {
    if (!isAndroid) return 'denied';
    if (usesAllFilesAccess) {
        if (await systemGates.isAllFilesAccessGranted()) return 'granted';
        await systemGates.requestAllFilesAccess();
        return checkStorageReadAccess();
    }
    return fromResult(await request(PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE));
}

/**
 * 请求写存储访问（删原文件用）：R+ 复用全文件访问（读写一体、进本地音乐页通常已授予）；
 * ≤10 请求 WRITE_EXTERNAL_STORAGE——与 READ 同 STORAGE 权限组，READ 已授予时系统静默 granted、不弹窗
 */
export async function requestStorageWriteAccess(): Promise<StorageAccessStatus> {
    if (!isAndroid) return 'denied';
    if (usesAllFilesAccess) {
        return requestStorageReadAccess();
    }
    return fromResult(
        await request(PERMISSIONS.ANDROID.WRITE_EXTERNAL_STORAGE),
    );
}

/** 打开系统设置页：≤10 运行时权限被永久拒绝（blocked）后唯一的授予入口，靠回前台复检收敛 */
export async function openStorageSettings(): Promise<void> {
    await openSettings();
}
