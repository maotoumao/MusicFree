/**
 * 迁移阶梯 runner：版本门控 + 逐步提交，把 Playlist store 从旧 schema 推进到新版
 * 崩溃安全：每步「migrate 干活 → 提交版本号」，版本号是唯一原子提交点；崩在提交前 → 版本没变、下次重放，故 migrate 必须幂等可重放
 * 本文件是 legacyImport 的唯一 importer（v0→v1 导入经 MIGRATIONS 接入）
 */
import { importLegacyIntoV1 } from './legacyImport';

import type { LegacyImportDeps, LegacyImportReport } from './legacyImport';

/** store schema 版本读写 cell；实现封装 Playlist.index/$version 的原生 number 读写 */
export interface StoreVersionCell {
    /** 读当前版本；从未迁移过应返回 0 */
    get(): number;
    /** 提交到指定版本；迁移步骤成功后由 runner 调 */
    set(version: number): void;
}

/** 一步迁移：把 store 推进到 toVersion */
export interface PlaylistMigration {
    /** 目标版本号；须为严格递增的正整数；runner 只跑 toVersion > 当前版本的步骤 */
    readonly toVersion: number;
    /**
     * 迁移动作；必须同步（禁止 async / 返回 thenable）、幂等可重放
     * 只读写业务 store，绝不碰 $version（版本提交只由 runner 完成）
     * 失败抛错：runner 不 bump 版本、后续步骤不执行、异常向上冒泡
     */
    migrate(): void;
}

/**
 * 版本门控依次执行迁移：升序跑 toVersion > 当前的步骤，每步成功即提交版本号
 * 先整表预检（严格递增正整数），坏表宁可抛错也不静默跳步或把非法值写进 $version
 * 任一步 migrate 抛错则中断：版本停在上一成功步、后续不跑、异常向上冒泡（下次启动重放）
 */
export function runMigrations(
    version: StoreVersionCell,
    migrations: readonly PlaylistMigration[],
): void {
    const ordered = [...migrations].sort((a, b) => a.toVersion - b.toVersion);
    let prev = 0;
    for (const { toVersion } of ordered) {
        if (!Number.isSafeInteger(toVersion) || toVersion <= prev) {
            throw new Error(
                `迁移表非法：toVersion=${toVersion} 须为严格递增的正整数`,
            );
        }
        prev = toVersion;
    }

    const current = version.get();
    if (!Number.isSafeInteger(current) || current < 0) {
        throw new Error(`store 版本非法：${current}`);
    }

    for (const migration of ordered) {
        if (migration.toVersion <= current) {
            continue;
        }
        migration.migrate();
        version.set(migration.toVersion);
    }
}

/**
 * playlist 迁移注册表工厂：deps 由 P4 装配（openStore/migrateArtwork/importedAt）
 * v1 = legacy LocalSheet.* 一次性导入干净 Playlist.*
 */
export function playlistMigrations(
    deps: LegacyImportDeps,
    onReport?: (report: LegacyImportReport) => void,
): readonly PlaylistMigration[] {
    // 同一次 migrate 把导入报告交给调用方留痕（进错误日志）；不直接调 importer（会二次执行 / 绕过版本提交）
    return [
        {
            toVersion: 1,
            migrate: () => {
                const report = importLegacyIntoV1(deps);
                onReport?.(report);
            },
        },
    ];
}
