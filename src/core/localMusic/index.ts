/**
 * 本地音乐库：扫描设备音频 → MusicItem(platform='本地') → 维护 library + 多视图 + 增删
 * library **懒加载**（不进浏览页不占内存）；播放/歌词单首走 mediaMeta + localPlugin、不碰 library
 * 扫描在原生 TagLib 批量做（native/mediaScanner 引擎桥，core/localMusic 属主），core 订阅事件、
 * 按 scanId 丢弃迟到事件、增量合并、落 MMKV、发 atom → UI
 */
import { exists, unlink } from '@dr.pogodin/react-native-fs';

import {
    AudioTagStatus,
    TagError,
    resolveCover as resolveCoverFile,
    readTags,
} from '@/infra/audioTags';
import {
    checkStorageReadAccess,
    openStorageSettings,
    requestStorageReadAccess,
    requestStorageWriteAccess,
} from '@/infra/permission';
import { findReadableFilePath } from '@/infra/sharedStorage';
import { getObject, getOrCreateMMKV, setObject } from '@/infra/storage';
import {
    getMountedVolumeRoots,
    PRIMARY_STORAGE_ROOT,
} from '@/infra/storageVolumes';
import {
    cancelScan as nativeCancelScan,
    isMediaScannerSupported,
    onScanComplete,
    onScanError,
    onScanProgress,
    startScan as nativeStartScan,
} from '@/native/mediaScanner';
import { isSameMediaRef, localPathToUri } from '@/utils/media';
import {
    filePathKey,
    isAtOrUnderDir,
    isUnderDir,
    stripFileScheme,
    stripTrailingSlash,
} from '@/utils/path';

import {
    collectionCoverRef,
    deriveCollections,
    duplicatedRefs,
    pathByRef,
    sortedCollectionMusic,
    sortedMusicList,
} from './derive';
import { legacyTagCharsetFor } from './lib/legacyTagCharset';
import { dropExcludedRoots, scanRootCandidates } from './lib/scanRoots';
import {
    serializeKnownFingerprints,
    toFileMeta,
    toMusicItem,
    toMusicItemFromLocalFile,
} from './localFileTransform';
import {
    getLibrary,
    getScanProgress as readScanProgress,
    resetLibrary,
    setLibrary,
    setScanProgress,
    validateSort,
} from './store';
import {
    LOCAL_LIBRARY_KEY,
    LOCAL_MUSIC_STORE_ID,
    LOCAL_SCAN_SETTINGS_KEY,
    LOCAL_SORT_KEY,
} from './types';

import type {
    ILocalMusic,
    LocalCollection,
    LocalCollectionView,
    LocalDeleteFailCode,
    LocalDeleteReport,
    LocalFileMeta,
    LocalLibrary,
    LocalMusicDeps,
    LocalSort,
    ResolvedLocalMusicFile,
    ScanProgress,
    ScanSettings,
} from './types';
import type { IMediaMeta } from '@/core/mediaMeta';
import type { AudioTagSnapshot } from '@/infra/audioTags';
import type { StorageAccessStatus } from '@/infra/permission';
import type {
    ScanCompleteEvent,
    ScanErrorEvent,
    ScanProgressEvent,
} from '@/native/mediaScanner';
import type { DeepReadonly, MediaRef, MusicItem } from '@/types';
import type { MMKV } from 'react-native-mmkv';

/** 支持的音频扩展名（小写无点） */
const AUDIO_EXTENSIONS: readonly string[] = [
    'mp3',
    'flac',
    'm4a',
    'aac',
    'wav',
    'ogg',
    'ape',
    'wma',
    'opus',
];
/** 每批经进度事件回传的条数 */
const SCAN_BATCH_SIZE = 100;

/**
 * 首装默认排除的目录：各家 ROM 存通话 / 语音录音的地方（m4a / mp3 / wav，全在音频白名单里，60 秒的时长
 * 过滤也拦不住）。只在设置里没有 `excludedDirs` 数组时回填（从未保存过、或字段缺失 / 非法）；
 * 已有数组（包括 []）原样保留。在「排除目录」里显示为普通条目，用户可删。
 * 只列主存储：SD 卡上的路径随卷而异
 */
const DEFAULT_EXCLUDED_DIRS: readonly string[] = [
    `${PRIMARY_STORAGE_ROOT}/Recordings`,
    `${PRIMARY_STORAGE_ROOT}/Record`,
    `${PRIMARY_STORAGE_ROOT}/Sounds`,
    `${PRIMARY_STORAGE_ROOT}/MIUI/sound_recorder`,
    `${PRIMARY_STORAGE_ROOT}/Music/Recordings`,
    `${PRIMARY_STORAGE_ROOT}/录音`,
];

/** 模块级单调 scanId：JS 单调分配、原样回带，供丢弃已取消旧扫描的迟到事件 */
let scanIdCounter = 0;

// —— 持久化数据校验（读外部存储=系统边界，损坏则回落默认）——

function nonNegNumber(n: unknown): number {
    return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : 0;
}

function stringArray(a: unknown): string[] {
    return Array.isArray(a)
        ? a.filter((x): x is string => typeof x === 'string')
        : [];
}

/** 目录数组规范化：过滤非字符串 + trim + 去尾斜杠 + 丢弃空项（防空串被当作根前缀排除全部） */
function dirArray(a: unknown): string[] {
    return stringArray(a)
        .map(p => p.trim())
        .filter(p => p.length > 0)
        .map(stripTrailingSlash)
        .filter(p => p.length > 0);
}

/** 规范化扫描设置：非法/缺失字段回落默认、隔离外部数组引用 */
function normalizeScanSettings(raw: unknown): ScanSettings {
    const r = (raw ?? {}) as Partial<ScanSettings>;
    return {
        mode: r.mode === 'custom' ? 'custom' : 'all',
        includedDirs: dirArray(r.includedDirs),
        // 没有数组（从未保存过 / 字段缺失或非法）→ 给默认排除；已有数组（含清空过的 []）就尊重
        excludedDirs: Array.isArray(r.excludedDirs)
            ? dirArray(r.excludedDirs)
            : [...DEFAULT_EXCLUDED_DIRS],
        // 只有显式关掉才算关：老配置没这个字段，行为应与以前一致（一直是收录的）
        includeDownloadDir: r.includeDownloadDir !== false,
        minDurationSec: nonNegNumber(r.minDurationSec),
        minSizeBytes: nonNegNumber(r.minSizeBytes),
    };
}

function musicCount(lib: LocalLibrary): number {
    return Object.keys(lib.musicByPath).length;
}

/** 取所在目录（无分隔符时归根目录）——派生「文件夹」集合用 */
function dirnameOf(path: string): string {
    const i = path.lastIndexOf('/');
    return i <= 0 ? '/' : path.slice(0, i);
}

/** 扩展名是否在本项目支持的音频白名单内（小写比对） */
function hasSupportedAudioExtension(path: string): boolean {
    const dot = path.lastIndexOf('.');
    if (dot < 0) {
        return false;
    }
    return AUDIO_EXTENSIONS.includes(path.slice(dot + 1).toLowerCase());
}

/**
 * 指纹里的「未经扫描确认」标记：`addFile` 拿不到封面标记等真实元数据，只能先填近似值
 * 真实文件 mtime 不可能是 0，故指纹必不匹配，下次扫描一定会重读这个文件并校正
 */
const UNSCANNED_MTIME = 0;

/** rn-fs unlink 错误 → 稳定失败码（原始 message 仅用于分支判断、不外泄） */
function deleteFailCode(reason: unknown): LocalDeleteFailCode {
    const message = reason instanceof Error ? reason.message : String(reason);
    if (/ENOENT|no such file|not exist/i.test(message)) {
        return 'notFound';
    }
    if (/EACCES|EPERM|permission/i.test(message)) {
        return 'permission';
    }
    if (/EIO|EBUSY|EROFS/i.test(message)) {
        return 'io';
    }
    return 'unknown';
}

/** 单次删除并发上限（防全选数千首突发 JS↔native + 存储 IO） */
const DELETE_CONCURRENCY = 8;

/** 文件是否仍存在（三态：true=在 / false=不在 / undefined=查询异常无法确认，永久删除不能据此当已删） */
async function stillExists(path: string): Promise<boolean | undefined> {
    try {
        return await exists(path);
    } catch {
        return undefined;
    }
}

/** 删单个文件并复核真删除（RNFS Android unlink 无条件 resolve、不校 File.delete()）；成功返 null、失败返码 */
async function deleteOne(path: string): Promise<LocalDeleteFailCode | null> {
    try {
        await unlink(path);
    } catch (reason) {
        const code = deleteFailCode(reason);
        // ENOENT=文件已不存在，视为删除达成
        if (code === 'notFound') {
            return null;
        }
        // 只有确认文件已不在才算删成；仍在或无法确认都保守报原失败码
        return (await stillExists(path)) === false ? null : code;
    }
    // unlink resolve 未必真删了 → 复核；确认不在=成功，仍在或无法确认=保守失败
    return (await stillExists(path)) === false ? null : 'io';
}

export class LocalMusic implements ILocalMusic {
    readonly #mediaMeta: IMediaMeta;
    readonly #getDownloadTarget: LocalMusicDeps['getDownloadTarget'];
    readonly #getLocale: LocalMusicDeps['getLocale'];

    // 扫描运行时态：活跃代次、累积中的 draft library + 曲目计数、事件订阅
    #activeScanId = -1;
    #pendingLibrary: LocalLibrary | null = null;
    /**
     * 全盘扫描的删除结算护栏：本次实际交给原生的 root 列表；custom 模式为 null（不设护栏）
     *
     * 原生把「不在任何 root 之下」的旧路径一律报进 removedPaths（含「超出范围」的本意）。
     * custom 模式下那确实是用户缩小了范围，该删；但全盘模式没有「范围之外」——
     * 出现这种路径只说明那个卷这次没被枚举到（卡拔了 / 系统漏报 / 取卷失败），
     * 此时删库就是凭一次枚举失败把用户卡上的歌全抹掉，故一律不认
     *
     * 排除目录不走这条护栏，而是由 #scanPruneDirs 独立清理：那不是推断出来的「消失」，
     * 而是照办用户的设置，与原生报没报都无关
     *
     * 已知局限（路径身份）：这里比对的是原样 root，而 removedPaths 出自原生 canonical 化后的
     * 路径。某个卷根是符号链接的设备（少数 7–10 机型的 /storage/sdcardN）上两者对不上，
     * 后果是**过度保留**：那张卡上真删掉的文件、以及整卷被排除后的旧条目都清不出库
     * （偏安全的那一侧，不会误删）。原生侧已把排除项与 root 同源 canonical 化，
     * 「排除了却照扫」不受此影响；要让这里也精确，得让原生把它用的 canonical 身份回传，
     * 那是加宽 ScanCompleteEvent 契约的事，留待需要时再做
     */
    #scanRootGuard: readonly string[] | null = null;
    /**
     * 本次扫描要从库里清掉的目录：用户显式排除的那些，与 roots 同时定格
     * **不能只靠原生的 removedPaths**——排除目录若落在「列不出来的目录」（如 Android/data）
     * 之下，原生会把整棵标成不可信子树、其下一律不参与删除结算，于是用户明确排除的歌
     * 会赖在库里。故完成时按这份快照自己扫一遍
     */
    #scanPruneDirs: readonly string[] = [];
    /** 本次扫描用的旧标签修复码表；每读到一条就打戳进该文件的 LocalFileMeta */
    #scanTagCharset = '';
    /**
     * 最后真正交给原生的代次（-1=没有）
     * 取消必须按它来：原生的 cancelScan 是 compareAndSet(scanId)，
     * 拿 JS 刚认领、还没送到原生的新代次去取消，会 CAS 失败、放任上一轮全盘枚举跑到底
     */
    #nativeScanId = -1;
    #pendingCount = 0;
    // 本次扫描要排除的 path（用户已移除/删除，重扫不加回）
    #hiddenScanPaths: Set<string> = new Set();
    #subscriptions: { remove(): void }[] = [];
    /** 「文件已删除」的订阅者；本模块不知道那是谁，依赖因而保持单向 */
    readonly #filesDeletedListeners = new Set<
        (paths: readonly string[]) => void
    >();

    constructor(deps: LocalMusicDeps) {
        this.#mediaMeta = deps.mediaMeta;
        this.#getDownloadTarget = deps.getDownloadTarget;
        this.#getLocale = deps.getLocale;
    }

    /** MMKV 懒开：不进本地音乐页/不扫描则从不打开 store（getOrCreateMMKV 按 id 缓存复用） */
    get #store(): MMKV {
        return getOrCreateMMKV(LOCAL_MUSIC_STORE_ID);
    }

    // —— 权限（转发 infra/permission）——
    checkPermission(): Promise<StorageAccessStatus> {
        return checkStorageReadAccess();
    }
    requestPermission(): Promise<StorageAccessStatus> {
        return requestStorageReadAccess();
    }
    openPermissionSettings(): Promise<void> {
        return openStorageSettings();
    }
    requestFileWriteAccess(): Promise<StorageAccessStatus> {
        return requestStorageWriteAccess();
    }

    // —— 扫描 ——
    startScan(): void {
        if (!isMediaScannerSupported) {
            return;
        }
        const base = getLibrary();
        const settings = this.getScanSettings();
        const scanId = ++scanIdCounter;
        this.#activeScanId = scanId;
        // 立刻停掉原生上一轮：新扫描一定取代它，而本轮要等卷列表才发起，
        // 这段窗口里若不停它，用户按取消时它已不是任何人认领的代次，就会带着一趟
        // 全盘枚举跑到底（也白占 IO）
        this.#cancelNativeScan();
        // clone 一次为可变 draft：后续每批原地 upsert，避免每批全量拷贝 library（万级曲目下 O(N²) → O(N)）
        this.#pendingLibrary = {
            version: base.version,
            musicByPath: { ...base.musicByPath },
            files: { ...base.files },
        };
        this.#pendingCount = musicCount(base);
        // 仅本次扫描 evict 的路径进内存排除：防用户刚移除的行被在跑的扫描几秒后又添回去
        this.#hiddenScanPaths = new Set();
        this.#resubscribe();
        setScanProgress({
            status: 'enumerating',
            found: this.#pendingCount,
            processed: 0,
            total: 0,
            currentPath: '',
        });
        // 取存储卷要过一趟桥（异步），故发起分两段：同步认领代次 + 立刻进 enumerating，
        // 卷列表回来后才真正启动原生；期间被取消 / 被新扫描抢占则不再启动（代次核对）
        this.#launchScan(scanId, settings, base).catch(() =>
            // 启动阶段就失败（原生受理抛错等）：不能把 UI 永远留在 enumerating 上
            this.#onError({
                scanId,
                code: 'E_UNKNOWN',
                message: 'start failed',
            }),
        );
    }

    /** 取卷 → 算 roots → 启动原生；期间代次已变（取消 / 抢占）就此作罢 */
    async #launchScan(
        scanId: number,
        settings: ScanSettings,
        base: LocalLibrary,
    ): Promise<void> {
        // 只有全盘模式用得上卷列表；custom 模式的根是用户指定的，不必也不该等这趟桥
        const volumeRoots =
            settings.mode === 'all' ? await getMountedVolumeRoots() : [];
        if (this.#activeScanId !== scanId) {
            return;
        }
        const downloadTarget = this.#getDownloadTarget();
        // 「下载完成后加入本地音乐」开着 = 用户说这些歌算他的本地音乐，那扫描就必须看这个目录：
        // 不看它，差量结算会把 addFile 刚写进库的那些歌判成「已消失」而清掉，
        // 库与扫描来回打架（这也是开关的承诺所要求的）。放末尾——原生 LIFO 出栈，
        // 嵌在别的 root 子树里的专用 root 要排在后面才不会被外层先吞掉
        const candidates = [
            ...scanRootCandidates(settings, volumeRoots),
            ...(settings.includeDownloadDir ? [downloadTarget.dir] : []),
        ];
        // 关掉时只对 **app 私有默认目录** 做一件事：把它并进完成时的库清理
        // 那个目录在 `Android/data` 之下、系统不让枚举（原生把整棵标成不可信子树、
        // 其下条目一律不参与删除结算），不自己清的话「关掉开关」对已入库的歌永远没效果
        // 自定义目录不这样做：它可能就是用户的普通音乐文件夹，清它等于替他删了一整个文件夹
        // ——那正是旧版被推翻的那条风险
        const excludedDirs =
            settings.includeDownloadDir || !downloadTarget.isAppPrivate
                ? settings.excludedDirs
                : [...settings.excludedDirs, downloadTarget.dir];
        // 排除盖住哪个根就摘哪个根，否则原生会忽略「等于/高于 root 的排除项」，
        // 变成「排除了却照扫」；用户明确排除的目录压过上面这条追加
        const roots = dropExcludedRoots(candidates, excludedDirs);
        if (roots.length === 0) {
            // 配置本身要求「什么都不扫」（所有候选根都被排除项盖住了）：
            // 就地按原生对空 roots 的同一个码报失败，省一趟桥往返，也不递给原生一份
            // 它契约里不该出现的空 roots（上一轮原生已在 startScan 里停掉，无人替它续跑）
            //
            // 已知局限：这一分支是同步落地的，若上一次也停在 failed，
            // 只看 status 的反馈层（pages/localMusic 的 useScanFeedback）看不到状态变化、
            // 重试时不会再弹一次 toast——失败态本身照常渲染，故未为它加宽进度契约
            this.#onError({ scanId, code: 'E_IO', message: 'no scan roots' });
            return;
        }
        // 全盘模式下「不在任何 root 之下」只可能是没枚举到的卷（拔出的卡 / 系统漏报），
        // 不是用户缩小了范围，故这些旧条目不得被当作已删除（见 #onComplete）
        // 本次扫描用的旧标签码表：入参与「跑完后落盘」都用它，两处必须同一个值
        const tagCharset = legacyTagCharsetFor(this.#getLocale());
        this.#scanTagCharset = tagCharset;
        this.#scanRootGuard = settings.mode === 'all' ? roots : null;
        this.#scanPruneDirs = excludedDirs;
        this.#nativeScanId = scanId;
        nativeStartScan({
            scanId,
            roots: [...roots],
            excludedDirs: [...excludedDirs],
            extensions: [...AUDIO_EXTENSIONS],
            minDurationSec: settings.minDurationSec,
            minSizeBytes: settings.minSizeBytes,
            // 逐条比对该文件上次读用的码表：不同（含升级前入的库）的那几条不吃增量，
            // 否则指纹只看 mtime:size、文件没变就跳过读 tag，已入库的乱码永远修不掉
            knownFingerprintsJson: serializeKnownFingerprints(
                base.files,
                tagCharset,
            ),
            batchSize: SCAN_BATCH_SIZE,
            // 旧标签乱码的修复码表；空串=不修（不认识的语言不拿 GBK 去赌）
            legacyTagCharset: tagCharset,
        });
    }

    cancelScan(): void {
        if (this.#activeScanId < 0) {
            return;
        }
        this.#cancelNativeScan();
        // 保留已累积 draft、不做完成删除结算
        const draft = this.#pendingLibrary;
        if (draft !== null) {
            setLibrary(draft);
            setObject(this.#store, LOCAL_LIBRARY_KEY, draft);
        }
        this.#endScan();
        setScanProgress({ ...readScanProgress(), status: 'cancelled' });
    }

    // —— 设置（真相源 MMKV、不镜像 atom）——
    setScanSettings(patch: Partial<ScanSettings>): void {
        const next = normalizeScanSettings({
            ...this.getScanSettings(),
            ...patch,
        });
        setObject(this.#store, LOCAL_SCAN_SETTINGS_KEY, next);
    }
    setSort(sort: LocalSort): void {
        setObject(this.#store, LOCAL_SORT_KEY, validateSort(sort));
    }

    // —— 增删 ——
    removeFromLibrary(refs: readonly MediaRef[]): void {
        this.#evictPaths(this.#pathsOf(refs));
    }
    /** 清空扫描缓存库：库归 null（回待扫描态）、进度 idle、删持久化快照；保留 scanSettings/sort */
    clearLibrary(): void {
        // 作废在途扫描（若有）：停原生 + 复位内部态并退订，迟到 progress/complete 按 scanId 丢弃、不复活库
        // 不持久化 draft（区别 cancelScan 的「保留已扫结果」）
        if (this.#activeScanId >= 0) {
            this.#cancelNativeScan();
            this.#endScan();
        }
        resetLibrary();
        setObject(this.#store, LOCAL_LIBRARY_KEY, undefined);
    }
    async deleteFiles(refs: readonly MediaRef[]): Promise<LocalDeleteReport> {
        const library = getLibrary();
        // ref → path：优先库、回退 mediaMeta 锚点（已移出库的曲仍可删）；去重 + 无路径计 notFound
        const byPath = new Map<string, { path: string; refs: MediaRef[] }>();
        const failures: { code: LocalDeleteFailCode; path?: string }[] = [];
        for (const ref of refs) {
            const rawPath =
                pathByRef(library, ref) ??
                this.#mediaMeta.getLocalFiles(ref)[0]?.path;
            const path =
                rawPath !== undefined ? stripFileScheme(rawPath) : undefined;
            if (path === undefined) {
                failures.push({ code: 'notFound' });
            } else {
                const existing = byPath.get(path);
                if (existing) {
                    if (!existing.refs.some(r => isSameMediaRef(r, ref))) {
                        existing.refs.push(ref);
                    }
                } else {
                    // 带上调用方给的身份：库里可能没有这个 path（清空过库 / 从库里移除过），
                    // 或因缺 MF_MUSICITEM 标签被扫成了「本地」身份，不能丢掉原插件 ref（#674）
                    byPath.set(path, { path, refs: [ref] });
                }
            }
        }
        const report = await this.#deleteTargets([...byPath.values()]);
        return {
            deleted: report.deleted,
            failed: report.failed + failures.length,
            failures: [...failures, ...report.failures],
        };
    }

    deleteFilesAt(paths: readonly string[]): Promise<LocalDeleteReport> {
        return this.#deleteTargets(
            [...new Set(paths.map(stripFileScheme))].map(path => ({ path })),
        );
    }

    /**
     * 删文件的本体：unlink 复核 → 收尾清理 → 广播
     * `refs` 是调用方已知的身份（可选）：与库内身份并集清理，避免无 MF_MUSICITEM 标签时
     * 库内「本地」身份覆盖掉调用方传入的插件身份（#674）
     */
    async #deleteTargets(
        input: readonly { path: string; refs?: readonly MediaRef[] }[],
    ): Promise<LocalDeleteReport> {
        const before = getLibrary();
        // 同时保留库内身份与调用方身份（按 platform+id 去重），并记下当时的 LocalFileMeta 作并发回收哨兵
        const targets = input.map(t => {
            const refs: MediaRef[] = [];
            const libRef = before.musicByPath[t.path];
            if (libRef) {
                refs.push(libRef);
            }
            for (const callerRef of t.refs ?? []) {
                if (!refs.some(r => isSameMediaRef(r, callerRef))) {
                    refs.push(callerRef);
                }
            }
            return {
                path: t.path,
                refs,
                meta: before.files[t.path],
            };
        });
        const result = await this.#unlinkPaths(targets);
        //
        // 删盘是分批 await 的，这期间路径可能已被回收：原生发布只在遇同名时才加后缀，
        // 名字一腾出来，另一首歌的下载完成就会 addFile 到同一个 path 上。
        // 收尾清理若照着开头那份快照做，会把刚进库的新条目连锚点一起清掉。
        //
        // 判据用**对象引用**而非字段比对：某个 path 被重新写入时，它的 LocalFileMeta
        // 必是新对象（addFile / 扫描更新都造新的）；而值比对在这里不可靠——
        // addFile 会继承同 path 旧条目的 addedAt，同音质重下的 sizeBytes 也可能一样，
        // mtimeMs 在 addFile 写的又固定是 UNSCANNED_MTIME
        //
        // 引用不等就跳过，失败方向是安全的：宁可库里留一条指不到文件的记录
        //（下次扫描按盘上实际内容重建时自会清掉），也不误删刚落地的新条目
        const after = getLibrary();
        const mine = result.succeeded.filter(
            t => after.files[t.path] === t.meta,
        );
        // 主删除收尾（清锚点、摘库、广播）必须在同一同步块内紧跟 after 快照完成：
        // 中间一旦插入 await，刚腾出的路径可能被并发完成的下载重新占用，迟到的广播会误摘新记录
        const siblingRefs: MediaRef[] = [];
        for (const t of mine) {
            for (const ref of t.refs) {
                try {
                    this.#mediaMeta.clearLocalFile(ref, t.path);
                    if (
                        this.#mediaMeta.hasLocalFile(ref) &&
                        !siblingRefs.some(r => isSameMediaRef(r, ref))
                    ) {
                        siblingRefs.push(ref);
                    }
                } catch {
                    // 留个指不到文件的锚点，播放侧会优雅降级
                }
            }
        }
        try {
            this.#evictPaths(mine.map(t => t.path));
        } catch {
            // 库里留着指不到文件的条目，下次扫描按盘上实际内容重建时自会清掉
        }
        // 广播 mine 而非全部删成功的路径：被回收掉的那些，路径上现在躺着**别人的新文件**，
        // 对订阅方而言「这个路径的文件」并没有消失。照实播报会让它们去删一条指向存在文件的记录
        this.#emitFilesDeleted(mine.map(t => t.path));
        if (siblingRefs.length > 0) {
            await this.#sweepDeadSiblingAnchors(siblingRefs);
        }
        return {
            deleted: result.succeeded.length,
            failed: result.failures.length,
            failures: result.failures,
        };
    }

    /**
     * 订阅「文件已删除」；返回退订函数
     *
     * 删文件要同步清掉其它模块持有的记录（如下载记录），但本模块不得知道它们存在。
     * 广播让依赖保持单向，也把跨模块一致性收到一处——否则它会被摊派给每一个 UI 删除入口，
     * 漏一个就是悬空记录（设计 §6）
     *
     * 事件是「文件已删除」而非「库变了」：「从本地库移除」与「清空音乐库」都不删文件，
     * 下载记录不该跟着消失
     */
    subscribeFilesDeleted(cb: (paths: readonly string[]) => void): () => void {
        this.#filesDeletedListeners.add(cb);
        return () => {
            this.#filesDeletedListeners.delete(cb);
        };
    }

    /**
     * 一个订阅者抛错不能让删除看起来失败，也不能阻断后面的订阅者
     *
     * 事件是**同步**分发的：订阅者只做同步记账；要做异步收尾就自己安排、自己吞掉拒绝
     * （广播方不该 await 未知的订阅者——一个慢订阅者会把删除结果一起拖住）
     */
    #emitFilesDeleted(paths: readonly string[]): void {
        if (paths.length === 0) {
            return; // 一个都没删成，省掉订阅者那边一次无谓的全库扫查
        }
        // 快照两头：冻结载荷防订阅者互相污染，复制订阅者列表以免分发期间新加的收到本次事件
        const payload = Object.freeze([...paths]);
        for (const cb of [...this.#filesDeletedListeners]) {
            try {
                cb(payload);
            } catch {
                // 订阅者自己的毛病，与删文件成败无关
            }
        }
    }

    /** 有界并发 unlink + 复核；只管文件，库内清理与锚点由调用方做 */
    async #unlinkPaths<T extends { path: string }>(
        targets: readonly T[],
    ): Promise<{
        succeeded: T[];
        failures: { code: LocalDeleteFailCode; path?: string }[];
    }> {
        const failures: { code: LocalDeleteFailCode; path?: string }[] = [];
        const succeeded: T[] = [];
        for (let i = 0; i < targets.length; i += DELETE_CONCURRENCY) {
            const chunk = targets.slice(i, i + DELETE_CONCURRENCY);
            const codes = await Promise.all(chunk.map(t => deleteOne(t.path)));
            for (let j = 0; j < chunk.length; j++) {
                const target = chunk[j];
                const code = codes[j];
                if (!target) {
                    continue;
                }
                if (code === null) {
                    succeeded.push(target);
                } else if (code) {
                    failures.push({ code, path: target.path });
                }
            }
        }
        return { succeeded, failures };
    }

    // —— 增删 ——
    /**
     * 把一个**已知文件**并入库（来源无关：谁把文件放到设备上的，本模块不关心）
     *
     * 不做「同一首歌只留一份」的判断——库按 path 忠实存储，代表由派生层现算。
     * 元数据是此刻能拿到的近似值（封面标记、专辑艺术家都取不到），故指纹刻意标记为
     * 「未经扫描确认」，让下次扫描必定重读这个文件、用原生给出的真实值校正
     */
    addFile(input: {
        item: DeepReadonly<MusicItem>;
        path: string;
        sizeBytes: number;
        addedAt: number;
    }): void {
        // 开关关掉 = 用户说「下载完成不要自动写进本地库」（设计 §9）
        const settings = this.getScanSettings();
        if (!settings.includeDownloadDir) {
            return;
        }
        // 落在用户明确排除的目录里就不写：排除压过这个开关（扫描侧同样如此），
        // 否则每下一首都写进库、下一次扫描又按排除清掉，来回打架
        if (settings.excludedDirs.some(dir => isUnderDir(input.path, dir))) {
            return;
        }
        const item = {
            ...(input.item as MusicItem),
            url: localPathToUri(input.path),
        };
        const meta: LocalFileMeta = {
            // 0 = 未经扫描确认：真实 mtime 绝不会是 0，故指纹必不匹配、下次扫描必重读
            mtimeMs: UNSCANNED_MTIME,
            sizeBytes: input.sizeBytes,
            addedAt: input.addedAt,
            hasCoverArt: false,
            albumArtist: item.artist,
            folderPath: dirnameOf(input.path),
        };
        // 扫描进行中：草稿会在扫描结束时整体回写，不同步写进去这条就会被覆盖掉、凭空消失
        const draft = this.#pendingLibrary;
        if (draft !== null && !(input.path in draft.musicByPath)) {
            this.#pendingCount++;
        }
        if (draft !== null) {
            draft.musicByPath[input.path] = item;
            draft.files[input.path] = {
                ...meta,
                addedAt: draft.files[input.path]?.addedAt ?? input.addedAt,
            };
        }
        const library = getLibrary();
        const next: LocalLibrary = {
            version: library.version,
            musicByPath: { ...library.musicByPath, [input.path]: item },
            files: {
                ...library.files,
                [input.path]: {
                    ...meta,
                    addedAt:
                        library.files[input.path]?.addedAt ?? input.addedAt,
                },
            },
        };
        // 落库失败就不改内存，避免两者不一致；下次扫描会把这个文件收进来
        if (!setObject(this.#store, LOCAL_LIBRARY_KEY, next)) {
            return;
        }
        setLibrary(next);
    }

    // —— 外部打开 ——

    /**
     * 把系统交来的文件位置解析成可播条目；非本地音频或定位不到一律 null
     *
     * 刻意不查 library：查库要为一次单曲播放同步 hydrate 整个库，而库里可能多出的那些字段
     * （声明自带的 artwork、入库时留下的完整 item）都不是播放一个本地文件所必需的
     * 收藏 / 播放历史等按 MediaRef 索引，身份一致即可对上，与是否入库无关
     */
    async resolveMusicFile(
        fileLocation: string,
    ): Promise<ResolvedLocalMusicFile | null> {
        const path = await findReadableFilePath(fileLocation);
        // 定位不到真实路径（云盘等 provider 本就无对应文件）：无法给出稳定身份，不支持
        if (!path || !hasSupportedAudioExtension(path)) {
            return null;
        }
        const tags = await this.#readTagsForOpen(path);
        if (tags === undefined) {
            return null;
        }
        const item = toMusicItemFromLocalFile(path, tags);
        // 外部打开不写持久锚点：path 只属于本次播放 occurrence，扫描 / 正式入库才建立长期关联
        return { item, path };
    }

    /**
     * 读 tag 供外部打开使用：null=读不出但仍可播（退化为文件名条目），undefined=不该播
     *
     * 只有「TagLib 不认识这个格式」才降级——此时文件仍可能是 Media3 播得了的音频。
     * 文件消失 / 无权限 / IO 故障都不给身份：这些是瞬时或环境问题，若照常合成路径身份，
     * 一个自带声明的文件就会因为一次读失败而分裂出第二个媒体身份，收藏与历史随之分家
     */
    async #readTagsForOpen(
        path: string,
    ): Promise<AudioTagSnapshot | null | undefined> {
        try {
            return await readTags(path);
        } catch (e) {
            return e instanceof TagError &&
                e.status === AudioTagStatus.Unsupported
                ? null
                : undefined;
        }
    }

    // —— 读取 ——

    getMusicList(): readonly MusicItem[] {
        return sortedMusicList(getLibrary(), this.getSort());
    }
    getCollections(view: LocalCollectionView): readonly LocalCollection[] {
        return deriveCollections(getLibrary(), view);
    }
    getCollectionMusic(
        view: LocalCollectionView,
        key: string,
    ): readonly MusicItem[] {
        return sortedCollectionMusic(getLibrary(), view, key, this.getSort());
    }
    /** 惰性解析某本地曲封面 → uri（查 library 补 url + hasCoverArt → infra 提取，无则 null） */
    resolveCover(ref: MediaRef): Promise<string | null> {
        const library = getLibrary();
        const path = pathByRef(library, ref);
        if (!path) {
            return Promise.resolve(null);
        }
        const item = library.musicByPath[path];
        if (!item?.url) {
            return Promise.resolve(null);
        }
        return resolveCoverFile(
            item.id,
            item.url,
            library.files[path]?.hasCoverArt ?? false,
        );
    }
    /** 某集合的代表封面曲 ref（供详情头惰性 resolveCover；无则 undefined） */
    getCollectionCoverRef(
        view: LocalCollectionView,
        key: string,
    ): Readonly<MediaRef> | undefined {
        return collectionCoverRef(getLibrary(), view, key);
    }
    getScanProgress(): ScanProgress {
        return readScanProgress();
    }
    getScanSettings(): ScanSettings {
        return normalizeScanSettings(
            getObject(this.#store, LOCAL_SCAN_SETTINGS_KEY),
        );
    }
    getSort(): LocalSort {
        return validateSort(getObject(this.#store, LOCAL_SORT_KEY));
    }

    // —— 扫描事件（按 scanId 丢迟到）——
    #onProgress(e: ScanProgressEvent): void {
        const draft = this.#pendingLibrary;
        if (e.scanId !== this.#activeScanId || draft === null) {
            return;
        }
        const discoveredAt = Date.now();
        // 库按 path 忠实存储：同一首歌的多份文件都入库，「每首只显示一行」由派生层现算代表
        for (const f of e.batch) {
            if (this.#hiddenScanPaths.has(f.path)) {
                continue; // 用户已移除/删除，重扫不加回
            }
            const item = toMusicItem(f);
            draft.files[f.path] = toFileMeta(
                f,
                draft.files[f.path]?.addedAt,
                discoveredAt,
                this.#scanTagCharset,
            );
            // 身份按条目真实身份取——自带声明的文件是插件身份，不是路径派生的本地身份；
            // 同身份有多份副本时这里会被后来者覆盖，由 #onComplete 按最终代表统一纠正
            this.#mediaMeta.setLocalPath(item, f.path);
            if (!(f.path in draft.musicByPath)) {
                this.#pendingCount++;
            }
            draft.musicByPath[f.path] = item;
        }
        setScanProgress({
            status: 'scanning',
            found: this.#pendingCount,
            processed: e.processed,
            total: e.total,
            currentPath: e.currentPath,
        });
    }
    #onComplete(e: ScanCompleteEvent): void {
        const draft = this.#pendingLibrary;
        if (e.scanId !== this.#activeScanId || draft === null) {
            return;
        }
        // 差量删除确认消失的旧曲目；failedPaths（瞬时读失败）保留旧缓存、不动
        const guard = this.#scanRootGuard;
        const removedCandidates: { path: string; ref?: MediaRef }[] = [];
        for (const p of e.removedPaths) {
            // 全盘模式：只认落在本次实际扫过的根之下的删除（护栏见 #scanRootGuard）
            if (guard !== null && !guard.some(root => isUnderDir(p, root))) {
                continue;
            }
            const ref = draft.musicByPath[p];
            this.#dropFromDraft(draft, p);
            removedCandidates.push({ path: p, ref });
        }
        // 用户显式排除的目录由 core 自己清一遍：
        // 原生的 removedPaths 指望不上——排除目录落在「列不出来的目录」（如下载目录所在的
        // Android/data）之下时，那整棵会被标成不可信子树、其下一律不参与删除结算
        const pruneDirs = this.#scanPruneDirs;
        if (pruneDirs.length > 0) {
            for (const p of Object.keys(draft.musicByPath)) {
                if (pruneDirs.some(dir => isUnderDir(p, dir))) {
                    this.#dropFromDraft(draft, p);
                }
            }
        }
        setLibrary(draft);
        setObject(this.#store, LOCAL_LIBRARY_KEY, draft);
        this.#realignAnchors(draft);
        // 保留末批 processed/total 作为完成态分母（tagsRead 是本次读 tag 数，增量复用多时会缩、不能当进度）
        // found 须在 #endScan 清零 #pendingCount 前取本地值
        const prev = readScanProgress();
        const found = this.#pendingCount;
        this.#endScan();
        setScanProgress({
            status: 'completed',
            found,
            processed: prev.processed,
            total: prev.total,
            currentPath: '',
        });
        if (removedCandidates.length > 0) {
            this.#reconcileRemovedScanPaths(removedCandidates).catch(
                () => undefined,
            );
        }
    }
    #onError(e: ScanErrorEvent): void {
        if (e.scanId !== this.#activeScanId) {
            return;
        }
        this.#endScan();
        // draft 已丢弃，found 恢复为已提交库的曲目数（回退到上次成功态）
        setScanProgress({
            ...readScanProgress(),
            status: 'failed',
            found: musicCount(getLibrary()),
            errorCode: e.code,
        });
    }

    // —— 私有 ——
    /**
     * 把有多份文件的身份的播放锚点校回代表路径
     *
     * 扫描逐文件写锚点，同身份的副本会互相覆盖，最后写入的未必是列表里显示的那一行，
     * 于是出现「列表显示 A、点播打开 B」。此处只遍历确有副本的身份（正常为空），
     * 不对全库重写——万级库全量写 MMKV 会卡住 JS 线程
     */
    #realignAnchors(library: LocalLibrary): void {
        for (const path of duplicatedRefs(library).values()) {
            const item = library.musicByPath[path];
            if (item) {
                this.#mediaMeta.setLocalPath(item, path);
            }
        }
    }

    /**
     * 判断某个候选路径所在存储当前是否已挂载且具备读权限：
     * Android 上卷卸载或无存储权限时 `File.exists()` 也会返回 `false`，未过此护栏一律按未知保留，防误删 SD 卡记录
     */
    #canProbeAsMissing(
        barePath: string,
        mountedRootKeys: readonly string[],
        hasSharedReadAccess: boolean,
    ): boolean {
        const key = filePathKey(barePath);
        const dl = this.#getDownloadTarget();
        if (dl.isAppPrivate && isAtOrUnderDir(key, filePathKey(dl.dir))) {
            return true;
        }
        if (!hasSharedReadAccess) {
            return false;
        }
        return mountedRootKeys.some(root => isAtOrUnderDir(key, root));
    }

    /**
     * 构建当前库内所有存活路径的规范键集合（同步收尾阶段一次性构建，使单条复用判定降至 O(1)）
     */
    #currentLibraryPathKeys(): Set<string> {
        return new Set(Object.keys(getLibrary().musicByPath).map(filePathKey));
    }

    /**
     * 清掉给定曲目下确认已从磁盘消失的另一路径槽位（downloadData / localPath 双槽不同路径时兜底，#674）
     * 先过卷挂载与读权限护栏，且在全部异步探测结束后重新同步核对库占用再落盘与广播
     */
    async #sweepDeadSiblingAnchors(refs: readonly MediaRef[]): Promise<void> {
        const [mountedRoots, readStatus] = await Promise.all([
            getMountedVolumeRoots(),
            checkStorageReadAccess(),
        ]);
        const mountedRootKeys = mountedRoots.map(filePathKey);
        const hasSharedReadAccess = readStatus === 'granted';

        const probes: { ref: MediaRef; rawPath: string; barePath: string }[] =
            [];
        for (const ref of refs) {
            try {
                for (const candidate of this.#mediaMeta.getLocalFiles(ref)) {
                    const barePath = stripFileScheme(candidate.path);
                    if (
                        this.#canProbeAsMissing(
                            barePath,
                            mountedRootKeys,
                            hasSharedReadAccess,
                        )
                    ) {
                        probes.push({ ref, rawPath: candidate.path, barePath });
                    }
                }
            } catch {
                // 单条元数据读异常忽略
            }
        }
        if (probes.length === 0) {
            return;
        }

        const missing: typeof probes = [];
        for (let i = 0; i < probes.length; i += DELETE_CONCURRENCY) {
            const chunk = probes.slice(i, i + DELETE_CONCURRENCY);
            const checks = await Promise.all(
                chunk.map(p => stillExists(p.barePath)),
            );
            for (let j = 0; j < chunk.length; j++) {
                const p = chunk[j];
                if (p && checks[j] === false) {
                    missing.push(p);
                }
            }
        }
        if (missing.length === 0) {
            return;
        }

        // 所有异步探测全部完成后，在单一同步块内一次性建规范键集复核未重新入库，再清锚点与广播
        const livePathKeys = this.#currentLibraryPathKeys();
        const clearedPaths: string[] = [];
        for (const p of missing) {
            if (livePathKeys.has(filePathKey(p.barePath))) {
                continue;
            }
            try {
                this.#mediaMeta.clearLocalFile(p.ref, p.rawPath);
            } catch {
                // best-effort
            }
            clearedPaths.push(p.barePath);
        }
        if (clearedPaths.length > 0) {
            this.#emitFilesDeleted([...new Set(clearedPaths)]);
        }
    }

    /**
     * 扫描差量确认出库的旧路径：逐批复核磁盘上确实已不存在（排除因时长/目录过滤出库但文件仍在的情形）后，
     * 在单一同步收尾块中复核未重新入库、清掉 `mediaMeta` 锚点并广播「文件已删除」（#674）
     */
    async #reconcileRemovedScanPaths(
        candidates: readonly { path: string; ref?: MediaRef }[],
    ): Promise<void> {
        const [mountedRoots, readStatus] = await Promise.all([
            getMountedVolumeRoots(),
            checkStorageReadAccess(),
        ]);
        const mountedRootKeys = mountedRoots.map(filePathKey);
        const hasSharedReadAccess = readStatus === 'granted';

        const verifiable = candidates.filter(c =>
            this.#canProbeAsMissing(
                stripFileScheme(c.path),
                mountedRootKeys,
                hasSharedReadAccess,
            ),
        );
        if (verifiable.length === 0) {
            return;
        }

        const missing: { path: string; barePath: string; ref?: MediaRef }[] =
            [];
        for (let i = 0; i < verifiable.length; i += DELETE_CONCURRENCY) {
            const chunk = verifiable.slice(i, i + DELETE_CONCURRENCY);
            const checks = await Promise.all(
                chunk.map(c => stillExists(stripFileScheme(c.path))),
            );
            for (let j = 0; j < chunk.length; j++) {
                const entry = chunk[j];
                if (entry && checks[j] === false) {
                    missing.push({
                        path: entry.path,
                        barePath: stripFileScheme(entry.path),
                        ref: entry.ref,
                    });
                }
            }
        }
        if (missing.length === 0) {
            return;
        }

        // 所有批次探测结束后统一在同步块内一次性建规范键集复核库状态，防止后续批次 await 期间路径被新下载复用
        const livePathKeys = this.#currentLibraryPathKeys();
        const confirmedPaths: string[] = [];
        const siblingRefs: MediaRef[] = [];
        for (const entry of missing) {
            if (livePathKeys.has(filePathKey(entry.barePath))) {
                continue;
            }
            confirmedPaths.push(entry.barePath);
            if (entry.ref) {
                try {
                    this.#mediaMeta.clearLocalFile(entry.ref, entry.path);
                    if (
                        this.#mediaMeta.hasLocalFile(entry.ref) &&
                        !siblingRefs.some(r => isSameMediaRef(r, entry.ref!))
                    ) {
                        siblingRefs.push(entry.ref);
                    }
                } catch {
                    // best-effort：单条异常不阻断后续广播
                }
            }
        }
        if (confirmedPaths.length > 0) {
            this.#emitFilesDeleted([...new Set(confirmedPaths)]);
        }
        if (siblingRefs.length > 0) {
            await this.#sweepDeadSiblingAnchors(siblingRefs);
        }
    }

    #resubscribe(): void {
        this.#unsubscribe();
        this.#subscriptions = [
            onScanProgress(e => this.#onProgress(e)),
            onScanComplete(e => this.#onComplete(e)),
            onScanError(e => this.#onError(e)),
        ];
    }
    #unsubscribe(): void {
        this.#subscriptions.forEach(s => s.remove());
        this.#subscriptions = [];
    }
    /** 从在建 draft 里摘掉一条（同时维护曲目计数）；不在库里则无事发生 */
    #dropFromDraft(draft: LocalLibrary, path: string): void {
        if (path in draft.musicByPath) {
            this.#pendingCount--;
        }
        delete draft.musicByPath[path];
        delete draft.files[path];
    }

    /**
     * 停掉原生那一轮：按 #nativeScanId（原生只认它真正受理过的代次）
     * JS 可能已认领了更新的代次却还没送到原生（在等卷列表），此时要停的是上一轮
     */
    #cancelNativeScan(): void {
        if (this.#nativeScanId >= 0) {
            nativeCancelScan(this.#nativeScanId);
            this.#nativeScanId = -1;
        }
    }

    /** 结束扫描：清运行时态 + 退订（进度状态由调用方按结局设置） */
    #endScan(): void {
        this.#pendingLibrary = null;
        this.#pendingCount = 0;
        this.#activeScanId = -1;
        this.#nativeScanId = -1;
        this.#scanRootGuard = null;
        this.#scanPruneDirs = [];
        this.#unsubscribe();
    }

    /** refs → 库内 path（byRef 反查、去重、丢弃不在库的） */
    #pathsOf(refs: readonly MediaRef[]): string[] {
        const library = getLibrary();
        const seen = new Set<string>();
        for (const ref of refs) {
            const path = pathByRef(library, ref);
            if (path !== undefined) {
                seen.add(path);
            }
        }
        return [...seen];
    }

    /** 从库移除给定 path：删 library（换新引用→缓存失效）；不碰 mediaMeta.localPath（锚点与库成员分离，移出库文件仍在、留给 deleteFiles 回退取路径）；不写任何持久排除，下次扫描扫回 */
    #evictPaths(paths: readonly string[]): void {
        if (paths.length === 0) {
            return;
        }
        const library = getLibrary();
        const musicByPath = { ...library.musicByPath };
        const files = { ...library.files };
        for (const path of paths) {
            delete musicByPath[path];
            delete files[path];
        }
        const next: LocalLibrary = {
            version: library.version,
            musicByPath,
            files,
        };
        setLibrary(next);
        setObject(this.#store, LOCAL_LIBRARY_KEY, next);
        // 扫描进行中：同步 draft + 本次内存排除集，防移除项被 #onProgress/#onComplete 复活（下次扫描不受影响、扫回）
        const draft = this.#pendingLibrary;
        if (draft !== null) {
            for (const path of paths) {
                this.#hiddenScanPaths.add(path);
                if (path in draft.musicByPath) {
                    this.#pendingCount--;
                    delete draft.musicByPath[path];
                    delete draft.files[path];
                }
            }
        }
    }
}

/** 裸对象 live-binding，UX 直接 localMusic.xxx()；由 app/container 装配 */
export let localMusic: ILocalMusic;

/** 仅由 app/container 调用，用于装配 localMusic 单例 */
export function provideLocalMusic(instance: ILocalMusic): void {
    localMusic = instance;
}

export {
    useAddDownloadsToLibrary,
    useCollectionMusic,
    useHasLibrarySnapshot,
    useLocalCollections,
    useLocalMusicList,
    useLocalSort,
    useScanProgress,
    useScanStatus,
} from './hooks';

export { DEFAULT_SORT } from './types';

export type {
    ILocalMusic,
    LocalCollection,
    LocalCollectionView,
    LocalDeleteFailCode,
    LocalDeleteReport,
    LocalMusicView,
    ResolvedLocalMusicFile,
    LocalSort,
    LocalSortBy,
    ScanProgress,
    ScanSettings,
    ScanStatus,
} from './types';
