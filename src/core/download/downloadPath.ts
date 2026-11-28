/**
 * 下载落盘目录：解析与形态校验（纯计算）
 *
 * 真相源是 `basic.downloadPath`（空串 = 用 app 私有默认目录）。凡是要知道「文件落在哪」
 * 的地方都经这里问，别自己拼——用户随时可以把它改到任意目录
 * 「能不能写」不在这里判：那要碰盘，走 `infra/fileSystem` 的 ensureWritableDir
 */
import { defaultDownloadDir } from '@/infra/paths';
import { normalizeAbsoluteDir, stripTrailingSlash } from '@/utils/path';

import type { IConfig } from '@/core/config';

/**
 * 本次要用的下载目录（绝对路径、无尾斜杠）
 * 配置值非法（相对路径 / 只有斜杠 / 空白）时按未设置处理——宁可下到默认目录，
 * 也不能把一个拼不出合法路径的值递给原生
 */
export function resolveDownloadDir(config: IConfig): string {
    // 先判类型再 trim：config.get 不过 configRules（那套规则只喂 isValid），
    // MMKV 里存着非字符串时这里会抛，而调用方（scheduler 每次发起、设置页 render）
    // 都不是能接住异常的地方——「非法即回退默认」这条契约必须在这里就成立
    const raw = config.get('basic.downloadPath');
    const configured = typeof raw === 'string' ? raw.trim() : '';
    return isUsableDownloadDir(configured)
        ? stripTrailingSlash(configured)
        : defaultDownloadDir;
}

/** 是否为可用作下载目录的路径形态（绝对路径且有实际段）；不判存在性与可写性 */
export function isUsableDownloadDir(path: string): boolean {
    return normalizeAbsoluteDir(path) !== null;
}

/** 规范化用户选的目录；形态非法回 null */
export const normalizeDownloadDir = normalizeAbsoluteDir;

/** 是否正在用默认目录（UI 据此决定要不要给「恢复默认」） */
export function isDefaultDownloadDir(config: IConfig): boolean {
    return resolveDownloadDir(config) === defaultDownloadDir;
}
