import { exists, readDir } from '@dr.pogodin/react-native-fs';
import { createMMKV, type MMKV } from 'react-native-mmkv';

import { basePath } from '@/infra/paths';
import { safeParse, safeStringify } from '@/utils/json';

/** 持久化 MMKV 目录：对齐 legacy ${basePath}/mmkv，Android 升级用户零迁移读到 legacy 数据 */
const MMKV_DIR = `${basePath}/mmkv`;

/** 已建实例缓存：同 id 复用一个 MMKV，避免重复创建 */
const instances = new Map<string, MMKV>();

/** 已打开实例和旧明文文件的 ID；仅剩哈希文件时无法反推原 ID */
async function listMMKVIds(): Promise<string[]> {
    const ids = new Set(instances.keys());
    if (await exists(MMKV_DIR)) {
        const entries = await readDir(MMKV_DIR);
        const names = new Set(
            entries.filter(entry => entry.isFile()).map(entry => entry.name),
        );
        for (const name of names) {
            if (names.has(`${name}.crc`)) {
                ids.add(name);
            }
        }
    }
    return [...ids];
}

/**
 * 按 id 取/建 MMKV 实例（同 id 复用）
 * id 是持久化契约（沿用 legacy），改了毁用户数据
 */
export function getOrCreateMMKV(id: string): MMKV {
    let mmkv = instances.get(id);
    if (!mmkv) {
        // TODO cache-only MMKV（regenerable、不外露）后续走内部路径（默认 filesDir/mmkv 或 cachesDir），加 cache 变体参数区分
        mmkv = createMMKV({ id, path: MMKV_DIR });
        instances.set(id, mmkv);
    }
    return mmkv;
}

/** 读并 JSON 反序列化（失败返 undefined）；与原生 getString 并列 */
export function getObject<T>(mmkv: MMKV, key: string): T | undefined {
    return safeParse<T>(mmkv.getString(key));
}

/** JSON 序列化后写入；value 为 undefined 时删除该 key（清值语义，与 MMKV hook 一致）；返回是否落库（序列化失败返 false 且不写） */
export function setObject(mmkv: MMKV, key: string, value: unknown): boolean {
    if (value === undefined) {
        mmkv.remove(key);
        return true;
    }
    const text = safeStringify(value);
    if (text !== undefined) {
        mmkv.set(key, text);
        return true;
    }
    return false;
}

/**
 * store schema 版本保留键：原生 number（非 JSON），驱动该 store 的迁移
 * 沿用 legacy 约定；`$` 前缀隔离数据键。绝不能用 getObject/setObject/useMMKVObject 碰它（会当 JSON 读裸数字）
 */
const VERSION_KEY = '$version';

/** 读 store schema 版本（从未写过 = 0）；配合 setStoreVersion 判断/驱动迁移 */
export function getStoreVersion(mmkv: MMKV): number {
    return mmkv.getNumber(VERSION_KEY) ?? 0;
}

/** 写 store schema 版本（原生 number；迁移完成后调） */
export function setStoreVersion(mmkv: MMKV, version: number): void {
    mmkv.set(VERSION_KEY, version);
}

export { listMMKVIds };
