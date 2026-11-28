import { CachesDirectoryPath, stat, unlink } from '@dr.pogodin/react-native-fs';
import { v4 as uuidv4 } from 'uuid';

import { appVersion, os } from '@/infra/device';
import { readUtf8File } from '@/infra/fileSystem';
import { createTextFileWriter } from '@/infra/fileWriter';
import { getInstallationId } from '@/infra/installationId';
import { saveToDownloads } from '@/infra/sharedStorage';
import { delay, TimeoutError } from '@/infra/timer';
import {
    createWebdavStore,
    WebdavRequestError,
    type WebdavCredentials,
} from '@/infra/webdav';
import { LOCAL_MEDIA_PLATFORM, uriToLocalPath } from '@/utils/media';
import { utf8ByteLength } from '@/utils/text';
import { looksLikeHttpUrl } from '@/utils/url';

import { parseBackupText } from './parse';
import {
    gateLocalMedia,
    restoreMediaMetaSection,
    restoreMusicSheetsSection,
    restorePluginsSection,
    restoreSettingsSection,
    restoreStarredPlaylistsSection,
} from './restore';
import { serializeEnvelope } from './serialize';

import type {
    AbortOptions,
    BackupDeps,
    BackupEnvelope,
    BackupExportResult,
    BackupFile,
    BackupSectionName,
    BackupSections,
    IBackup,
    ParseBackupResult,
    ParseBackupSourceResult,
    ParsedBackup,
    RestoreBackupOptions,
    RestoreBackupResult,
} from './types';
import type { ConfigKey } from '@/core/config';
import type { PluginsTransfer } from '@/core/plugin';

/**
 * 协议约定的跨端互通保证区间，任一维超出即不再承诺对端读得了
 * 导出时超出只警告不阻断，导入时超出直接拒收
 * 曲目维度只统计歌单内嵌曲目；mediaMeta 的 associatedLyric.musicItem 是歌词关联指向，
 * 计入会与歌单里的同一首重复计数
 */
const MAX_INTEROP_FILE_BYTES = 64 * 1024 * 1024;
const MAX_INTEROP_MUSIC_ITEMS = 100_000;
const URL_DOWNLOAD_TIMEOUT_MS = 20_000 + MAX_INTEROP_FILE_BYTES / 16;

/** WebDAV 远端固定位置：协议为保跨端互通而约定，不可按设备改 */
const WEBDAV_DIR = '/MusicFree';
const WEBDAV_BACKUP_PATH = `${WEBDAV_DIR}/MusicFreeBackup.json`;

/**
 * 备份操作的失败归类：给 UX 决定「怎么说」用
 *
 * 与 `classifyRestoreResult` 同一路子——把原始结局翻成 UX 档位这件事归 core，
 * 免得每个调用方各自去 `instanceof` 传输层的错误类型（那等于把 infra 摆进公开契约）
 * - `cancelled`：用户自己停的，不该再报一遍
 * - `timedOut`：服务端一直没回，要给「去查地址 / 网络」这类下一步
 * - `other`：其余一切，走各自的通用失败文案
 */
export type BackupFailureKind =
    | 'cancelled'
    | 'timedOut'
    | 'unauthorized'
    | 'forbidden'
    | 'notFound'
    | 'rateLimited'
    | 'storageFull'
    | 'unsupported'
    | 'other';

export function classifyBackupFailure(error: unknown): BackupFailureKind {
    if (error instanceof Error && error.name === 'AbortError') {
        return 'cancelled';
    }
    if (error instanceof TimeoutError) {
        return 'timedOut';
    }
    if (error instanceof Error) {
        switch ((error as { status?: number }).status) {
            case 401:
                return 'unauthorized';
            case 403:
                return 'forbidden';
            case 404:
                return 'notFound';
            case 429:
                return 'rateLimited';
            case 507:
                return 'storageFull';
            case 405:
            case 501:
                return 'unsupported';
        }
    }
    if (!(error instanceof WebdavRequestError)) {
        return 'other';
    }
    return error.kind === 'cancelled' ? 'cancelled' : 'timedOut';
}

function describeBackupFailure(error: unknown): string {
    if (
        error instanceof Error &&
        /^WebDAV (PROPFIND|MKCOL|GET|PUT|MOVE|DELETE): HTTP \d{3}$/.test(
            error.message,
        )
    ) {
        return error.message;
    }
    if (error instanceof Error) {
        const { status, method } = error as Error & {
            status?: unknown;
            method?: unknown;
        };
        if (
            typeof status === 'number' &&
            Number.isInteger(status) &&
            status >= 100 &&
            status <= 599
        ) {
            const prefix =
                typeof method === 'string' &&
                /^(GET|HEAD|POST|PUT|DELETE|PROPFIND|MKCOL|MOVE)$/.test(method)
                    ? `${method}: `
                    : '';
            return `${prefix}HTTP ${status}`;
        }
    }
    const kind = classifyBackupFailure(error);
    return error instanceof TypeError
        ? `${kind}: network or transport error`
        : kind;
}

/** 统计信封内的曲目数，用于互通保证区间的曲目维度 */
function countMusicItems(sections: BackupSections): number {
    let count = 0;
    for (const playlist of sections.musicSheets ?? []) {
        count += playlist.musicList.length;
    }
    for (const playlist of sections.starredPlaylists ?? []) {
        count += playlist.musicList?.length ?? 0;
    }
    return count;
}

/** 协议建议的本地备份文件名：MusicFreeBackup_<yyyyMMdd_HHmm>.json */
function backupFileName(at: Date): string {
    const pad = (value: number) => String(value).padStart(2, '0');
    const date = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(
        at.getDate(),
    )}`;
    return `MusicFreeBackup_${date}_${pad(at.getHours())}${pad(
        at.getMinutes(),
    )}.json`;
}

/**
 * 手机端 settings 白名单（附录 A 纳入项）；排除密钥与设备绑定项
 * 类型上排除两类，误加应当编译失败而不是靠 review 兜：
 * - `webdav.*`：凭据不入备份是协议红线
 * - `basic.downloadPath`：设备本地路径，换机后未必存在，恢复过去只会把下载指向一个不存在的目录
 */
const SETTINGS_WHITELIST: readonly Exclude<
    ConfigKey,
    `webdav.${string}` | 'basic.downloadPath'
>[] = [
    'basic.autoUpdatePlugin',
    'basic.notCheckPluginVersion',
    'plugin.ignoreAppVersion',
    'basic.useCelluarNetworkPlay',
    'basic.autoPlayWhenAppStart',
    'basic.autoStopWhenError',
    'basic.defaultPlayQuality',
    'basic.playQualityOrder',
    'basic.tryChangeSourceWhenPlayFail',
    'basic.maxCacheSize',
    'basic.maxHistoryLen',
    'playlist.defaultMusicSortMode',
    'basic.clickMusicInSearch',
    'basic.musicDetailAwake',
    'musicDetail.defaultView',
    'basic.useCelluarNetworkDownload',
    'basic.defaultDownloadQuality',
    'basic.downloadQualityOrder',
    'basic.maxDownload',
    'basic.downloadInterval',
    'lyric.autoSearchLyric',
    'lyric.fontSize',
    'lyric.showTranslation',
    'floatingLyric.enabled',
    'floatingLyric.mode',
    'floatingLyric.textColor',
    'floatingLyric.desktop.fontSize',
    'floatingLyric.desktop.backgroundOpacity',
    'floatingLyric.desktop.locked',
    'floatingLyric.statusBar.fontSize',
    'floatingLyric.statusBar.backgroundOpacity',
    'audioEffect.eqEnabled',
];

/** 缺省导出集 = 全部段 */
const ALL_SECTIONS: readonly BackupSectionName[] = [
    'musicSheets',
    'starredPlaylists',
    'plugins',
    'mediaMeta',
    'settings',
];

/** 未选中段的结局；每次返回独立对象，避免结果里多个字段共享同一引用 */
function notSelectedOutcome(): { status: 'skipped'; reason: 'notSelected' } {
    return { status: 'skipped', reason: 'notSelected' };
}

/**
 * 备份编排：组装信封（写）、解析归一（读）、逐段恢复（apply）、导出到本机与 WebDAV
 * React-free
 */
export class Backup implements IBackup {
    readonly #playlist: BackupDeps['playlist'];
    readonly #pluginManager: BackupDeps['pluginManager'];
    readonly #mediaMeta: BackupDeps['mediaMeta'];
    readonly #config: BackupDeps['config'];

    constructor(deps: BackupDeps) {
        this.#playlist = deps.playlist;
        this.#pluginManager = deps.pluginManager;
        this.#mediaMeta = deps.mediaMeta;
        this.#config = deps.config;
    }

    async createBackup(
        selection: readonly BackupSectionName[] = ALL_SECTIONS,
    ): Promise<BackupEnvelope> {
        const want = new Set(selection);
        const sections: BackupSections = {};

        // plugins 段与 mediaMeta 平台集合都依赖就绪、可信的插件注册表；
        // snapshotPlugins 会等待就绪并在对账失败时抛出——任一选中都先过这道屏障，
        // 避免 getOrder 在未就绪时给出残缺平台集、静默产出不完整的 mediaMeta
        let pluginsSnapshot: PluginsTransfer | undefined;
        if (want.has('plugins') || want.has('mediaMeta')) {
            pluginsSnapshot = await this.#pluginManager.snapshotPlugins();
        }

        // 选中段即取快照；快照失败向上抛（如 playlist 存储降级），宁失败不产不完整备份
        if (want.has('musicSheets')) {
            sections.musicSheets =
                await this.#playlist.snapshotLocalPlaylists();
        }
        if (want.has('starredPlaylists')) {
            sections.starredPlaylists =
                await this.#playlist.snapshotStarredPlaylists();
        }
        if (want.has('plugins')) {
            // 屏障已取到（want 含 plugins ⇒ 上面已 await）
            sections.plugins = pluginsSnapshot;
        }
        if (want.has('mediaMeta')) {
            const platforms = await this.#mediaMeta.listPlatforms([
                ...this.#pluginManager.getOrder(),
                LOCAL_MEDIA_PLATFORM,
            ]);
            sections.mediaMeta = this.#mediaMeta.snapshotMediaMeta(platforms);
        }
        if (want.has('settings')) {
            sections.settings = { values: this.#snapshotSettings() };
        }

        return {
            format: 'musicfree-backup',
            version: 2,
            createdAt: Date.now(),
            origin: {
                platform: os,
                appVersion,
                installationId: getInstallationId(),
            },
            sections,
        };
    }

    parseBackup(text: string): ParseBackupResult {
        return parseBackupText(text);
    }

    async parseBackupFile(
        filePathOrUri: string,
    ): Promise<ParseBackupSourceResult> {
        const path = uriToLocalPath(filePathOrUri);
        // 先 stat 再读：超出互通保证区间的文件直接拒收，好过读到一半让 App 莫名死掉
        const { size } = await stat(path);
        if (size > MAX_INTEROP_FILE_BYTES) {
            return { ok: false, reason: 'tooLarge', sizeBytes: size };
        }
        return parseBackupText(await readUtf8File(path, size));
    }

    async exportBackupToDownloads(
        selection?: readonly BackupSectionName[],
    ): Promise<BackupExportResult> {
        const file = await this.createBackupFile(selection);
        try {
            const uri = await saveToDownloads(
                file.path,
                backupFileName(new Date()),
                'application/json',
            );
            return {
                location: uri,
                sizeBytes: file.sizeBytes,
                exceedsInteropGuarantee: file.exceedsInteropGuarantee,
            };
        } finally {
            // 临时文件的所有权到此为止，交付成败都清掉
            await unlink(file.path).catch(() => undefined);
        }
    }

    async exportBackupToWebdav(
        selection: readonly BackupSectionName[] = ALL_SECTIONS,
        options?: AbortOptions,
    ): Promise<BackupExportResult> {
        const store = createWebdavStore(this.#webdavCredentials(), options);
        const envelope = await this.createBackup(selection);

        // 直接攒成字符串：上传要的就是完整文本，绕道临时文件反而要再读回来一遍
        const chunks: string[] = [];
        await serializeEnvelope(envelope, {
            write: chunk => {
                chunks.push(chunk);
                return Promise.resolve();
            },
        });
        const text = chunks.join('');
        // 提前量一次字节数：结果里要报，上传也要拿它折算超时预算，不必在 64 MiB 文本上扫两遍
        const sizeBytes = utf8ByteLength(text);

        await store.ensureDir(WEBDAV_DIR);
        await store.writeFile(WEBDAV_BACKUP_PATH, text, sizeBytes);

        return {
            location: WEBDAV_BACKUP_PATH,
            sizeBytes,
            exceedsInteropGuarantee:
                sizeBytes > MAX_INTEROP_FILE_BYTES ||
                countMusicItems(envelope.sections) > MAX_INTEROP_MUSIC_ITEMS,
        };
    }

    async parseBackupFromWebdav(
        options?: AbortOptions,
    ): Promise<ParseBackupSourceResult> {
        const store = createWebdavStore(this.#webdavCredentials(), options);
        const sizeBytes = await store.getFileSize(WEBDAV_BACKUP_PATH);
        if (sizeBytes > MAX_INTEROP_FILE_BYTES) {
            return { ok: false, reason: 'tooLarge', sizeBytes };
        }
        /*
         * 服务端可能不报大小（库把缺失的 content-length 当 "0"、空值 parseInt 成 NaN），
         * 此时上面那道闸形同虚设。传输预算按互通上限给：本端愿意受理的最大就是这么大，
         * 宁可让一次挂起多等一会儿（横幅上有取消键），也不能把一份仍在正常下载的大备份掐断——
         * 那种失败重试多少次都是同样的结果
         */
        const sizeKnown = Number.isFinite(sizeBytes) && sizeBytes > 0;
        const text = await store.readFile(
            WEBDAV_BACKUP_PATH,
            sizeKnown ? sizeBytes : MAX_INTEROP_FILE_BYTES,
        );
        const actualBytes = utf8ByteLength(text);
        if (actualBytes > MAX_INTEROP_FILE_BYTES) {
            return {
                ok: false,
                reason: 'tooLarge',
                sizeBytes: actualBytes,
            };
        }
        return parseBackupText(text);
    }

    async parseBackupFromUrl(
        url: string,
        options?: AbortOptions,
    ): Promise<ParseBackupSourceResult> {
        // 只认 http(s)：挡住 file:// 之类被诱导去读本机文件的输入
        if (!looksLikeHttpUrl(url)) {
            return { ok: false, reason: 'invalidUrl' };
        }
        const { signal } = options ?? {};
        const aborted = () =>
            Object.assign(new Error('Backup read cancelled'), {
                name: 'AbortError',
            });
        if (signal?.aborted) {
            throw aborted();
        }
        return new Promise<ParseBackupSourceResult>((resolve, reject) => {
            const request = new XMLHttpRequest();
            const timer = new AbortController();
            const totalDeadline = Date.now() + URL_DOWNLOAD_TIMEOUT_MS;
            let idleDeadline = Date.now() + 5000;
            let settled = false;
            let consumedLength = 0;
            let sizeBytes = 0;
            let remainingSurrogate = '';
            const finish = (complete: () => void, stop = false) => {
                if (settled) {
                    return;
                }
                settled = true;
                timer.abort();
                signal?.removeEventListener('abort', onAbort);
                request.onreadystatechange = null;
                request.onprogress = null;
                request.onload = null;
                request.onerror = null;
                request.ontimeout = null;
                request.onabort = null;
                if (stop) {
                    request.abort();
                }
                complete();
            };
            const fail = (error: unknown) => finish(() => reject(error), true);
            const onAbort = () => fail(aborted());
            const checkStatus = () => {
                if (request.status < 200 || request.status >= 300) {
                    fail(
                        Object.assign(
                            new Error(`GET: HTTP ${request.status}`),
                            {
                                status: request.status,
                                method: 'GET',
                            },
                        ),
                    );
                    return false;
                }
                return true;
            };
            const watchDeadline = async () => {
                while (!settled) {
                    const wait =
                        Math.min(idleDeadline, totalDeadline) - Date.now();
                    if (wait <= 0) {
                        fail(new TimeoutError());
                        return;
                    }
                    await delay(wait, {
                        runInBackground: true,
                        signal: timer.signal,
                    });
                }
            };
            try {
                request.open('GET', url);
                request.responseType = 'text';
                request.timeout = URL_DOWNLOAD_TIMEOUT_MS;
                request.onreadystatechange = () => {
                    if (!settled && request.readyState === 2 && checkStatus()) {
                        idleDeadline = Date.now() + 15000;
                    }
                };
                request.onprogress = () => {
                    if (settled) {
                        return;
                    }
                    idleDeadline = Date.now() + 15000;
                    let added =
                        remainingSurrogate +
                        request.responseText.slice(consumedLength);
                    consumedLength = request.responseText.length;
                    const last = added.charCodeAt(added.length - 1);
                    remainingSurrogate =
                        last >= 0xd800 && last <= 0xdbff ? added.slice(-1) : '';
                    if (remainingSurrogate) {
                        added = added.slice(0, -1);
                    }
                    sizeBytes += utf8ByteLength(added);
                    if (sizeBytes > MAX_INTEROP_FILE_BYTES) {
                        finish(
                            () =>
                                resolve({
                                    ok: false,
                                    reason: 'tooLarge',
                                    sizeBytes,
                                }),
                            true,
                        );
                    }
                };
                request.onload = () => {
                    if (settled || !checkStatus()) {
                        return;
                    }
                    const actualBytes = utf8ByteLength(request.responseText);
                    finish(() =>
                        resolve(
                            actualBytes > MAX_INTEROP_FILE_BYTES
                                ? {
                                      ok: false,
                                      reason: 'tooLarge',
                                      sizeBytes: actualBytes,
                                  }
                                : parseBackupText(request.responseText),
                        ),
                    );
                };
                request.onerror = () =>
                    fail(new TypeError('Network request failed'));
                request.ontimeout = () => fail(new TimeoutError());
                request.onabort = onAbort;
                signal?.addEventListener('abort', onAbort, { once: true });
                if (signal?.aborted) {
                    onAbort();
                    return;
                }
                watchDeadline().catch(error => {
                    if (!settled) {
                        fail(error);
                    }
                });
                request.send();
            } catch (error) {
                fail(error);
            }
        });
    }

    testWebdavConnection(
        credentials: WebdavCredentials,
        options?: AbortOptions,
    ): Promise<void> {
        return createWebdavStore(credentials, options).testConnection();
    }

    /** 每次操作取一份连接凭据快照；地址未配置时拒绝操作 */
    #webdavCredentials(): WebdavCredentials {
        const url = this.#config.get('webdav.url');
        if (url === undefined || url.length === 0) {
            throw new Error('尚未配置 WebDAV 服务器地址');
        }
        return {
            url,
            username: this.#config.get('webdav.username') ?? '',
            password: this.#config.get('webdav.password') ?? '',
        };
    }

    async createBackupFile(
        selection: readonly BackupSectionName[] = ALL_SECTIONS,
    ): Promise<BackupFile> {
        const envelope = await this.createBackup(selection);
        // 先落私有缓存目录：写入期间文件是残缺的，发布到目的地由调用方在完成后进行
        // 用随机名而非时间戳，避免并发导出撞名后互相截断、或清理时误删对方的文件
        const path = `${CachesDirectoryPath}/musicfree-backup-${uuidv4()}.json`;
        const writer = createTextFileWriter(path);

        let sizeBytes: number;
        try {
            await serializeEnvelope(envelope, writer);
            sizeBytes = await writer.close();
        } catch (error) {
            // 半成品既读不了又会误导，尽力清掉；清理本身失败不应掩盖原始错误
            await unlink(path).catch(() => undefined);
            throw error;
        }

        return {
            path,
            sizeBytes,
            exceedsInteropGuarantee:
                sizeBytes > MAX_INTEROP_FILE_BYTES ||
                countMusicItems(envelope.sections) > MAX_INTEROP_MUSIC_ITEMS,
        };
    }

    async restoreBackup(
        parsed: ParsedBackup,
        options: RestoreBackupOptions,
    ): Promise<RestoreBackupResult> {
        const want = new Set(options.selection ?? ALL_SECTIONS);
        // 本地曲仅在「同一安装」恢复：legacy / 桌面 v1 无 origin，一律按跨设备处理（fail-closed）
        const backupInstallationId = parsed.origin?.installationId;
        const sameInstallation =
            backupInstallationId !== undefined &&
            backupInstallationId.length > 0 &&
            backupInstallationId === getInstallationId();
        // 只门控选中的段：未选中的段既不该计进忽略数，也不必白扫（歌单可达十万曲规模）
        const { sections, localMediaIgnored } = gateLocalMedia(
            {
                ...(want.has('musicSheets')
                    ? { musicSheets: parsed.sections.musicSheets }
                    : {}),
                ...(want.has('starredPlaylists')
                    ? { starredPlaylists: parsed.sections.starredPlaylists }
                    : {}),
                ...(want.has('mediaMeta')
                    ? { mediaMeta: parsed.sections.mediaMeta }
                    : {}),
            },
            sameInstallation,
        );

        // 段间串行：结果顺序确定、错误归属清晰（协议允许插件段并行，但不强制）
        return {
            musicSheets: want.has('musicSheets')
                ? await restoreMusicSheetsSection(
                      this.#playlist,
                      sections.musicSheets,
                      options.mode,
                  )
                : notSelectedOutcome(),
            starredPlaylists: want.has('starredPlaylists')
                ? await restoreStarredPlaylistsSection(
                      this.#playlist,
                      sections.starredPlaylists,
                      options.mode,
                  )
                : notSelectedOutcome(),
            plugins: want.has('plugins')
                ? await restorePluginsSection(
                      this.#pluginManager,
                      parsed.sections.plugins,
                  )
                : notSelectedOutcome(),
            mediaMeta: want.has('mediaMeta')
                ? restoreMediaMetaSection(this.#mediaMeta, sections.mediaMeta)
                : notSelectedOutcome(),
            settings: want.has('settings')
                ? restoreSettingsSection(
                      this.#config,
                      parsed.sections.settings,
                      SETTINGS_WHITELIST,
                  )
                : notSelectedOutcome(),
            localMediaIgnored,
        };
    }

    /** 白名单键 → { key: value }；只纳入用户显式设过的（getStored 有键），未设的略过、恢复时跟随目标端默认 */
    #snapshotSettings(): Record<string, unknown> {
        const values: Record<string, unknown> = {};
        for (const key of SETTINGS_WHITELIST) {
            const value = this.#config.getStored(key);
            if (value !== undefined) {
                values[key] = value;
            }
        }
        return values;
    }
}

/** 裸对象 live-binding；由 app/container 装配 */
export let backup: IBackup;

/** 仅 app/container 调：装配 backup 单例 */
export function provideBackup(instance: IBackup): void {
    backup = instance;
}

export type {
    AbortOptions,
    BackupDeps,
    BackupEnvelope,
    BackupExportResult,
    BackupFile,
    BackupFormatVariant,
    BackupOrigin,
    BackupRestoreMode,
    BackupSectionName,
    BackupSections,
    BackupSettings,
    IBackup,
    ParseBackupResult,
    ParseBackupSourceResult,
    ParsedBackup,
    RestoreBackupOptions,
    RestoreBackupResult,
    RestoreSectionOutcome,
    SettingsRestoreResult,
} from './types';

export { describeBackupFailure };
export { classifyRestoreResult } from './restore';
