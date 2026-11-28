/**
 * app 私有文件路径布局
 * basePath = app 私有外部根目录（Android 外部私有目录 / iOS 文档目录）：免权限、文件管理器可见、= legacy 原路径
 * 持久化 MMKV、插件源码、下载等「用户可见 / 需升级延续」的文件都挂在此根下
 */
import {
    DocumentDirectoryPath,
    ExternalDirectoryPath,
} from '@dr.pogodin/react-native-fs';

import { os } from '@/infra/device';

/** ExternalDirectoryPath 在 iOS 为空串，故 iOS 走文档目录 */
export const basePath =
    os === 'ios' ? DocumentDirectoryPath : ExternalDirectoryPath;

/**
 * **默认**下载目录（app 私有根下的 download/）：免权限、卸载即删
 * 用户可在设置里改到任意目录，故这只是缺省值——有效目录一律问 `core/download`
 * （`resolveDownloadDir`），别在别处拿这个常量当「下载目录」用
 */
export const defaultDownloadDir = `${basePath}/download`;

/**
 * 歌词文本根目录（app 私有根下的 lyric/）
 * 其下分两区：custom/ 是用户手工编辑的词（持久），cache/ 是插件词与关联来源的词（可淘汰）
 */
export const lyricDir = `${basePath}/lyric`;
