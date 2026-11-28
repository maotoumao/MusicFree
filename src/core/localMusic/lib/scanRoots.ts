/**
 * 扫描根的取法（纯计算）：由扫描设置 + 设备存储卷推出这一趟要交给原生的 roots
 * core 与设置页共用同一函数——「全盘到底扫哪些卷」只能有一个说法
 *
 * 分两步是必要的：**候选**是「用户想扫哪些根」，**过滤后**是「这趟真交给原生的根」。
 * 摘根这一步不能藏进候选里——否则任何基于候选的判断（如设置页的冲突提示）都会看到一份
 * 「已经自我修正过」的列表，永远发现不了冲突
 */
import { PRIMARY_STORAGE_ROOT } from '@/infra/storageVolumes';
import { isAtOrUnderDir } from '@/utils/path';

import type { ScanSettings } from '../types';

/** 保序去重 */
function dedupe(paths: readonly string[]): string[] {
    return [...new Set(paths)];
}

/**
 * 候选扫描根（未经排除过滤）
 * - `custom`：用户指定的目录
 * - `all`：主存储根 + 各存储卷根（SD 卡等）
 *
 * 全盘模式恒含 `PRIMARY_STORAGE_ROOT`：卷列表取不到时若连内置存储都不传，
 * 原生会把库里所有内置存储条目算作「已消失」而清空整库——这条兜底不能省
 */
export function scanRootCandidates(
    settings: Pick<ScanSettings, 'mode' | 'includedDirs'>,
    volumeRoots: readonly string[],
): readonly string[] {
    return settings.mode === 'custom'
        ? dedupe(settings.includedDirs)
        : dedupe([PRIMARY_STORAGE_ROOT, ...volumeRoots]);
}

/**
 * 摘掉被排除项**整个盖住**的根
 *
 * 原生的排除是按 root 作用域生效的（等于 / 高于某 root 的排除项不否决那个 root，
 * 否则用户排除一个祖先就能干掉调用方明确要求扫的根），照传只会让「排除整张卡」
 * 变成「整张卡照扫」——与用户意图正好相反。摘掉后其下旧条目仍会按排除项如实
 * 清出库（见 index 的 #onComplete 护栏例外口）
 *
 * 结果可能为空（用户把所有根都排除了）：那是配置本身要求「什么都不扫」，
 * 由调用方给出可辨识的失败，不要偷偷塞个根进去
 */
export function dropExcludedRoots(
    roots: readonly string[],
    excludedDirs: readonly string[],
): readonly string[] {
    return roots.filter(
        root => !excludedDirs.some(ex => isAtOrUnderDir(root, ex)),
    );
}
