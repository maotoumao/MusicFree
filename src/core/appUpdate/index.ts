/**
 * 应用更新检查：向若干镜像源取版本清单，与当前版本比对
 *
 * 清单是**对外契约**（由发布流程写入仓库的 release/version.json），字段名不可改；
 * 内容来自网络、不可信，一律先校验形状与协议再交出去——下载地址会被交给系统打开，
 * 放行非 https 等于把跳转能力让给了清单的写入方，更新说明则限制条数与单条长度。
 *
 * 多源只为绕过网络可达性差异，且**必须把每个源都问一遍**：镜像同步有先后，
 * 先答的那个可能还是旧的（Gitee 同步、jsDelivr 缓存都不与仓库原子一致），
 * 只信第一个会把「已发新版」误报成「已是最新」。故取所有合法清单里版本最高的那份。
 */
import axios from 'axios';
import { compareVersions, validateStrict } from 'compare-versions';

import { appVersion } from '@/infra/device';
import { getObject, getOrCreateMMKV, setObject } from '@/infra/storage';
import { httpHostOf } from '@/utils/url';

/** 一次发布：版本号 + 更新说明 + 下载地址 */
export interface AppRelease {
    version: string;
    changeLog: readonly string[];
    downloadUrls: readonly string[];
}

/** 检查结果：区分「已最新」与「取不到清单」，前者是结论、后者是失败 */
export type UpdateCheckResult =
    | { kind: 'upToDate' }
    | { kind: 'available'; release: AppRelease }
    | { kind: 'failed' };

/** 更新检查端口：UX 经此发起；由 app/container 注入实现 */
export interface IAppUpdate {
    /** 取清单并与当前版本比对；不抛错，失败以 `failed` 表达 */
    check(): Promise<UpdateCheckResult>;
    /** 距上次实际请求满 24 小时才检查；未到期返回 undefined */
    checkIfDue(): Promise<UpdateCheckResult | undefined>;
    /** 指定版本是否已被用户跳过；兼容 legacy 的「跳过版本及更低版本」语义 */
    isVersionSkipped(version: string): boolean;
    /** 设置或清除跳过版本 */
    setVersionSkipped(version: string, skipped: boolean): void;
}

/** 应用持久状态 store id 是冻结 wire，改名会破坏已有用户数据 */
const APP_PERSIST_STATUS_STORE_ID = 'App.PersistStatus';
const SKIPPED_VERSION_KEY = 'app.skipVersion';
const LAST_CHECK_AT_KEY = 'app.lastUpdateCheckAt';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * 清单镜像，全部问一遍
 * 同一份文件的多个投递渠道，多源只为绕开网络封锁，不是多个发布源
 */
const RELEASE_MANIFEST_URLS = [
    'https://gitee.com/maotoumao/MusicFree/raw/master/release/version.json',
    'https://raw.githubusercontent.com/maotoumao/MusicFree/master/release/version.json',
    'https://cdn.jsdelivr.net/gh/maotoumao/MusicFree@master/release/version.json',
] as const;

/** 单源超时（ms）：连不上就尽快放弃，别让用户对着转圈等三次 TCP 超时 */
const REQUEST_TIMEOUT_MS = 8000;

/** 版本号长度上限：语义化版本再长也用不了这么多 */
const MAX_VERSION_LENGTH = 64;

/** 更新说明条数与单条长度上限：对话框里读的东西，不是发行公告全文 */
const MAX_CHANGELOG_LINES = 30;
const MAX_CHANGELOG_LINE_LENGTH = 200;

/** 下载地址条数与长度上限 */
const MAX_DOWNLOAD_URLS = 5;
const MAX_URL_LENGTH = 2048;

/** 控制字符（除换行制表）：显示层不需要，混进来只会干扰排版或日志 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F]/g;

function sanitizeLine(value: string): string {
    return value.replace(CONTROL_CHARS, '').trim();
}

/**
 * 下载地址白名单：只收 https、必须有主机、长度受限
 * 不接受明文 http——安装包链接被中间人换掉的代价是装上别人的 APK；
 * 主机解析交给 WHATWG（`httpHostOf` 顺带挡掉内嵌凭据的展示问题）
 */
function isAllowedDownloadUrl(value: unknown): value is string {
    if (typeof value !== 'string' || value.length > MAX_URL_LENGTH) {
        return false;
    }
    const trimmed = value.trim();
    return trimmed.startsWith('https://') && httpHostOf(trimmed) !== undefined;
}

/**
 * 校验并规整清单：任何一项不合形状就整体作废
 * 版本号走 `validateStrict`——`compareVersions` 对 `999.x`、`^999.0.0` 这类
 * 范围表达式**不抛错反而判为更新**，只靠 try/catch 兜不住虚假更新提示
 */
function parseRelease(data: unknown): AppRelease | null {
    if (typeof data !== 'object' || data === null) {
        return null;
    }
    const raw = data as Record<string, unknown>;
    if (typeof raw.version !== 'string') {
        return null;
    }
    // 发布方可能写成 v1.2.3；前导 v 是书写习惯，不是版本号的一部分
    const version = sanitizeLine(raw.version).replace(/^v/i, '');
    if (version.length > MAX_VERSION_LENGTH || !validateStrict(version)) {
        return null;
    }
    const downloadUrls = (Array.isArray(raw.download) ? raw.download : [])
        .filter(isAllowedDownloadUrl)
        .map(url => url.trim())
        .slice(0, MAX_DOWNLOAD_URLS);
    if (downloadUrls.length === 0) {
        return null;
    }
    const changeLog = (Array.isArray(raw.changeLog) ? raw.changeLog : [])
        .filter((line): line is string => typeof line === 'string')
        .slice(0, MAX_CHANGELOG_LINES)
        .map(line => sanitizeLine(line).slice(0, MAX_CHANGELOG_LINE_LENGTH))
        .filter(line => line.length > 0);
    return { version, changeLog, downloadUrls };
}

export class AppUpdate implements IAppUpdate {
    readonly #store = getOrCreateMMKV(APP_PERSIST_STATUS_STORE_ID);
    #checkInFlight: Promise<UpdateCheckResult> | undefined;

    check(): Promise<UpdateCheckResult> {
        if (!this.#checkInFlight) {
            try {
                setObject(this.#store, LAST_CHECK_AT_KEY, Date.now());
            } catch {
                return Promise.resolve({ kind: 'failed' });
            }
            const inFlight = this.#performCheck()
                .catch((): UpdateCheckResult => ({ kind: 'failed' }))
                .finally(() => {
                    if (this.#checkInFlight === inFlight) {
                        this.#checkInFlight = undefined;
                    }
                });
            this.#checkInFlight = inFlight;
        }
        return this.#checkInFlight;
    }

    checkIfDue(): Promise<UpdateCheckResult | undefined> {
        let lastCheckAt: unknown;
        try {
            lastCheckAt = getObject<unknown>(this.#store, LAST_CHECK_AT_KEY);
        } catch {
            return Promise.resolve({ kind: 'failed' });
        }
        if (typeof lastCheckAt === 'number' && Number.isFinite(lastCheckAt)) {
            const elapsed = Date.now() - lastCheckAt;
            if (elapsed >= 0 && elapsed < CHECK_INTERVAL_MS) {
                return Promise.resolve(undefined);
            }
        }
        return this.check();
    }

    async #performCheck(): Promise<UpdateCheckResult> {
        const releases = await Promise.all(
            RELEASE_MANIFEST_URLS.map(url => this.#fetchRelease(url)),
        );
        // 镜像同步有先后，取所有合法清单里版本最高的那份，而不是最先答的那份
        const newest = releases.reduce<AppRelease | null>(
            (best, current) =>
                current !== null &&
                (best === null ||
                    compareVersions(current.version, best.version) > 0)
                    ? current
                    : best,
            null,
        );
        if (newest === null) {
            return { kind: 'failed' };
        }
        return compareVersions(newest.version, appVersion) > 0
            ? { kind: 'available', release: newest }
            : { kind: 'upToDate' };
    }

    isVersionSkipped(version: string): boolean {
        let skippedVersion: unknown;
        try {
            skippedVersion = getObject<unknown>(
                this.#store,
                SKIPPED_VERSION_KEY,
            );
        } catch {
            return false;
        }
        return (
            typeof skippedVersion === 'string' &&
            validateStrict(skippedVersion) &&
            compareVersions(skippedVersion, version) >= 0
        );
    }

    setVersionSkipped(version: string, skipped: boolean): void {
        try {
            setObject(
                this.#store,
                SKIPPED_VERSION_KEY,
                skipped ? version : undefined,
            );
        } catch {
            // 跳过偏好写入失败不应打断弹窗交互
        }
    }

    async #fetchRelease(url: string): Promise<AppRelease | null> {
        try {
            const { data } = await axios.get<unknown>(url, {
                timeout: REQUEST_TIMEOUT_MS,
            });
            return parseRelease(data);
        } catch {
            return null;
        }
    }
}

/** 裸对象 live-binding，UX 直接 appUpdate.check()；由 app/container 装配 */
export let appUpdate: IAppUpdate;

/** 仅 app/container 调：装配 appUpdate 单例 */
export function provideAppUpdate(instance: IAppUpdate): void {
    appUpdate = instance;
}
