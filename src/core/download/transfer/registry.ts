/**
 * 活动任务队列的持久化：记录「现在还有哪些歌没下完，各自到什么状态了」
 *
 * 只存**未完成**的：一旦下完就改由本地音乐库持有，取消则直接移除。
 * 它是重启后重建活动队列的持久化真相源，故对外除了读写还报告一个关键信号：
 * `isComplete()` —— 内存视图是否完整反映磁盘。删文件这类不可逆操作必须先问它，
 * 否则一份残缺的视图会把用户仍可续传的断点当成孤儿删掉
 */
import {
    getObject,
    getOrCreateMMKV,
    getStoreVersion,
    setObject,
    setStoreVersion,
} from '@/infra/storage';
import { cloneJson } from '@/utils/json';
import { coerceMusicItem, isQualityKey, mediaKey } from '@/utils/media';
import { normalizeAbsoluteDir } from '@/utils/path';

import { isDownloadFailureReason } from './failure';
import { publishActiveDownloads } from './store';
import { DOWNLOAD_SCHEMA_VERSION, DOWNLOAD_STORE_ID } from './types';

import type {
    ActiveDownloadRecord,
    ActiveDownloadState,
    OwnerLookup,
    TransferIdentity,
} from './types';
import type { MMKV } from 'react-native-mmkv';

/** 活动态白名单（satisfies 保证与 ActiveDownloadState 同步） */
const ACTIVE_STATES = new Set<string>([
    'pending',
    'downloading',
    'paused',
    'failed',
] satisfies ActiveDownloadState[]);

/**
 * 下载 registry：只持久化活动任务（pending / downloading / paused / failed），一 mediaKey 一 MMKV key
 * 完成后改由本地库持有、取消即移除，故 registry 受并发 / 队列约束
 * 惰性 hydrate（首次访问时读入，不阻塞冷启动）；此后读走内存、写先落 MMKV 再更新内存
 * 持久化数据是系统边界：hydrate 与 put 都经 #normalize 校验 + 生成独立规范快照，单条损坏隔离丢弃
 */
export class DownloadRegistry {
    readonly #store: MMKV;
    readonly #active = new Map<string, ActiveDownloadRecord>();
    #hydrated = false;
    /**
     * 内存视图是否完整反映了磁盘上的任务
     * 未知 schema、读取抛错、或任一条记录无法解析时置 false——
     * 此时「存活任务集合」可能偏小，不得拿它去做删文件这类不可逆操作
     */
    #complete = false;

    constructor() {
        this.#store = getOrCreateMMKV(DOWNLOAD_STORE_ID);
    }

    /** 按 mediaKey 查活动任务 */
    get(key: string): ActiveDownloadRecord | undefined {
        this.#ensureHydrated();
        return this.#active.get(key);
    }

    /** 全部活动任务快照 */
    list(): ActiveDownloadRecord[] {
        this.#ensureHydrated();
        return [...this.#active.values()];
    }

    /**
     * 视图是否完整反映磁盘（供孤儿清理等**破坏性**维护判断）
     * false 时视图可能缺条目，据此推导的存活集合会漏掉仍在用的文件
     */
    isComplete(): boolean {
        this.#ensureHydrated();
        return this.#complete;
    }

    /**
     * 按传输身份反查这份文件属于哪首歌（活动任务数量很小，线性扫足够）
     * 没找到时区分「确实没有」与「视图不完整判不出」：后者不能当成任务已消失
     */
    findByContentKey(contentKey: string): OwnerLookup {
        const owner = this.list().find(
            r => r.transfer?.contentKey === contentKey,
        );
        if (owner) {
            return { kind: 'found', mediaKey: owner.mediaKey };
        }
        return this.isComplete() ? { kind: 'absent' } : { kind: 'unknown' };
    }

    /** 写入 / 更新活动任务：先落 MMKV 再更新内存（持久化是恢复队列的真相源）；非法记录或落库失败返回 false */
    put(record: ActiveDownloadRecord): boolean {
        this.#ensureHydrated();
        const snapshot = this.#normalize(record);
        if (!snapshot) return false;
        if (!setObject(this.#store, snapshot.mediaKey, snapshot)) return false;
        this.#active.set(snapshot.mediaKey, snapshot);
        this.#publish();
        return true;
    }

    /**
     * 移除活动任务（已完成 / 已取消）：先删 MMKV 再删内存，避免磁盘残留重启复活
     * 以「key 确实不在了」为成功判据并如实返回：调用方据此决定能否确认下游终态
     * （删不掉却当成功，重启后旧任务会复活并遮蔽已入库的完成记录）
     */
    remove(key: string): boolean {
        this.#ensureHydrated();
        try {
            setObject(this.#store, key, undefined); // undefined = 删 key
            if (this.#store.contains(key)) {
                return false;
            }
        } catch {
            return false;
        }
        this.#active.delete(key);
        this.#publish();
        return true;
    }

    /**
     * 把最新队列告知界面
     * 传取快照的函数而非快照本身：同一 tick 里连续写几百条时，
     * 只有最后那一次会真的克隆 Map，中间态一次都不用构造
     */
    #publish(): void {
        publishActiveDownloads(() => new Map(this.#active));
    }

    /** 惰性全量加载：按 schema 版本门控 + 逐条 normalize 读入内存 */
    #ensureHydrated(): void {
        if (this.#hydrated) return;
        this.#hydrated = true;
        try {
            this.#complete = this.#hydrate();
        } catch {
            this.#complete = false; // MMKV 读失败：视图不可信，绝不能拿去删文件
        }
        this.#publish(); // 上次进程留下的队列也要让界面看见
    }

    /** 实际读取；返回视图是否完整（无丢弃、无未知版本） */
    #hydrate(): boolean {
        const version = getStoreVersion(this.#store);
        if (version === 0) {
            setStoreVersion(this.#store, DOWNLOAD_SCHEMA_VERSION); // 首版空 store 初始化
            return true; // 空库也是完整的视图
        }
        if (version !== DOWNLOAD_SCHEMA_VERSION) {
            // 未知版本（未来 schema / 降级安装）：不按当前结构误读，保持空 registry、不覆盖版本号
            // 未来新增版本时在此做显式迁移后再读
            return false; // 磁盘上可能有任务，只是本版本读不懂
        }
        let complete = true;
        for (const key of this.#store.getAllKeys()) {
            if (key.startsWith('$')) continue; // 跳过 $version 等保留键
            const record = this.#normalize(
                getObject<unknown>(this.#store, key),
            );
            // MMKV key 必须与身份一致，否则视为漂移丢弃
            if (record && record.mediaKey === key) {
                this.#active.set(key, record);
            } else {
                complete = false; // 丢了一条：它名下的 `.part` 就失去保护
            }
        }
        return complete;
    }

    /**
     * 校验并生成独立规范快照（持久化边界）：state / 音质白名单 + 合法 item + 身份自洽
     * 深拷贝 item 切断调用方可变别名，并让内存与 MMKV 用同一份 JSON-compatible 结果；非法返回 undefined
     */
    #normalize(raw: unknown): ActiveDownloadRecord | undefined {
        if (typeof raw !== 'object' || raw === null) return undefined;
        const r = raw as Record<string, unknown>;
        if (typeof r.state !== 'string' || !ACTIVE_STATES.has(r.state))
            return undefined;
        if (!isQualityKey(r.requestedQuality)) {
            return undefined;
        }
        if (!coerceMusicItem(r.item)) return undefined;
        const cloned = cloneJson(r.item); // 不可序列化（循环引用 / BigInt / toJSON 抛错）→ undefined，不抛
        const item = cloned === undefined ? null : coerceMusicItem(cloned);
        if (!item) return undefined;
        const key = mediaKey(item);
        if (typeof r.mediaKey === 'string' && r.mediaKey !== key)
            return undefined; // 身份不一致
        const transfer = coerceTransfer(r.transfer);
        // transfer 字段在但解析不出 → 整条作废：宁可丢掉任务也不能拿一条「看似未开始传输」
        // 的残记录去算存活集合（那会让它名下的 `.part` 被当孤儿删掉）
        if (r.transfer !== undefined && transfer === undefined)
            return undefined;
        // 失败原因只是展示用，认不出就当没有（退回通用文案），不至于为它丢掉整条任务
        const failure = isDownloadFailureReason(r.failure)
            ? r.failure
            : undefined;
        return {
            item,
            mediaKey: key,
            requestedQuality: r.requestedQuality,
            state: r.state as ActiveDownloadState,
            // 缺失时归 0：排在最前，不至于因为一个排序字段丢掉整条任务
            enqueuedAt: Number.isSafeInteger(r.enqueuedAt)
                ? (r.enqueuedAt as number)
                : 0,
            ...(transfer === undefined ? {} : { transfer }),
            ...(failure === undefined ? {} : { failure }),
        };
    }
}

/**
 * 校验传输身份：前三项同生同死，缺一不可（少一项就无法可靠地认出盘上的 `.part`）
 *
 * `destDir` 是**可选**的：本字段之前落库的记录没有它，读出为空由调用方按当时唯一可能的
 * 目录（当前配置）解释。但**在而不合法就整条作废**——与上面三项同理：destDir 决定
 * 「这个 `.part` 躺在哪」，认错目录会让它在孤儿清理里被当残留删掉
 *
 * 这个函数同时是写入路径的规范化（`put` 经 `#normalize` 调它），所以**漏掉一个字段
 * 就等于那个字段永远存不进去**：内存与 MMKV 两份都会被这里的返回值覆盖
 */
function coerceTransfer(raw: unknown): TransferIdentity | undefined {
    if (typeof raw !== 'object' || raw === null) return undefined;
    const t = raw as Record<string, unknown>;
    if (!isQualityKey(t.resolvedQuality)) return undefined;
    if (typeof t.contentKey !== 'string' || t.contentKey.length === 0) {
        return undefined;
    }
    if (typeof t.stagingKey !== 'string' || t.stagingKey.length === 0) {
        return undefined;
    }
    // 归一化再存：带尾斜杠的值会永远 !== resolveDownloadDir 的输出，
    // 既拿不到 keep-list 保护，又会往启动清理的目录集合里塞一个假目录
    const destDir =
        typeof t.destDir === 'string' ? normalizeAbsoluteDir(t.destDir) : null;
    // 在而不合法（含非字符串）→ 整条作废：拿一个认错的目录去算存活集合，
    // 会让这条任务的 `.part` 在孤儿清理里被当残留删掉
    if (t.destDir !== undefined && destDir === null) {
        return undefined;
    }
    return {
        resolvedQuality: t.resolvedQuality,
        contentKey: t.contentKey,
        stagingKey: t.stagingKey,
        ...(destDir === null ? {} : { destDir }),
    };
}
