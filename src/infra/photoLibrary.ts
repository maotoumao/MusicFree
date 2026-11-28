/**
 * 相册写入：把本地图片存进系统相册（Android 媒体库 / iOS 照片）
 * 只申请写权限（write-only），不取得读取用户相册的能力
 * 领域无关机制：任何要把图片交给用户的功能都用，不含业务概念
 */
import { Album, Asset, requestPermissionsAsync } from 'expo-media-library';
import { Platform } from 'react-native';

import { localPathToUri } from '@/utils/media';

/** 相册写入权限态：granted=可写；denied=未授予、可再请求；blocked=永久拒绝、需去系统设置 */
export type PhotoLibraryAccessStatus = 'granted' | 'denied' | 'blocked';

/**
 * Android 11（R，API 30）起走分区存储：写自家资产免权限
 * 此前（API 24-29）写相册要 WRITE_EXTERNAL_STORAGE
 */
const usesScopedStorage =
    Platform.OS === 'android' && Number(Platform.Version) >= 30;

/**
 * 请求相册写入权限；已授予时系统不再弹窗
 * 分区存储下直接放行——WRITE_EXTERNAL_STORAGE 对 targetSdk 30+ 已失效，
 * 而 expo-media-library 在 API 30-32 仍会把它列进请求，再据结果判定会挡掉本来能成功的保存
 */
export async function requestPhotoLibraryWriteAccess(): Promise<PhotoLibraryAccessStatus> {
    if (usesScopedStorage) {
        return 'granted';
    }
    const { granted, canAskAgain } = await requestPermissionsAsync(true);
    if (granted) {
        return 'granted';
    }
    return canAskAgain ? 'denied' : 'blocked';
}

/**
 * 保存图片到相册，album 非空时尽力归入同名分组
 * 两步顺序不可换：先落默认位置（权限 / 磁盘 / 源文件的错在这一步暴露），再把已存好的资产移进分组
 * 反过来先建分组会留下两份——原生侧是「先写入再查询分组」，查询失败时图片已经落地，此时退回默认位置就是第二次写入
 */
export async function saveImageToPhotoLibrary(
    path: string,
    album?: string,
): Promise<void> {
    const asset = await Asset.create(localPathToUri(path));
    // 分组只在分区存储下做：iOS 的仅添加权限读不到相册列表，Android 旧版的搬移路径也不保证图片仍可见
    if (!album || !usesScopedStorage) {
        return;
    }
    try {
        // 第三参 = 移动而非复制；同名分组已存在时直接落进去，不必先查
        await Album.create(album, [asset], true);
    } catch {
        // 分组失败不算失败：图片已在相册默认位置，能看到比归得整齐重要
    }
}
