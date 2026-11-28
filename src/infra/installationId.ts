/**
 * 稳定安装标识：首次调用生成并持久化，之后恒返回同值
 * App 自生成（非硬件唯一标识），随 app 更新不变、仅卸载重装 / 清数据时重置
 * 备份用它判定「同一安装」，据此决定是否恢复本地曲的设备路径
 * 用 uuid v4；随机源由 index.js 顶部 react-native-get-random-values polyfill 提供
 */
import { v4 as uuidv4 } from 'uuid';

import { getOrCreateMMKV } from '@/infra/storage';

/** 安装标识 MMKV store：随 app 更新保留、仅卸载重装 / 清数据时重置 */
const INSTALLATION_STORE_ID = 'App.installation';
const INSTALLATION_ID_KEY = 'installationId';

let cached: string | undefined;

/** 稳定安装标识（见文件头） */
export function getInstallationId(): string {
    if (cached !== undefined) {
        return cached;
    }
    const mmkv = getOrCreateMMKV(INSTALLATION_STORE_ID);
    let id = mmkv.getString(INSTALLATION_ID_KEY);
    if (!id) {
        id = uuidv4();
        mmkv.set(INSTALLATION_ID_KEY, id);
    }
    cached = id;
    return id;
}
