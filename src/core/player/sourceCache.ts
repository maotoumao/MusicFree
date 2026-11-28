import { getObject, getOrCreateMMKV, setObject } from '@/infra/storage';
import { isQualityKey } from '@/utils/media';

import type { AudioSource, StreamType } from '@/native/audioEngine';
import type { MediaRef, QualityKey } from '@/types';

/**
 * 一次成功解析的结果：可播音源 + 检测出的流类型 + 实际命中的音质
 * streamType 让 core/player 建 AudioItem 时填对（hls/dash 不用等播放失败再学）
 */
export interface ResolvedSource {
    source: AudioSource;
    streamType: StreamType;
    quality: QualityKey;
}

/**
 * 音源缓存键：platform + id + quality
 * 同一首歌不同音质分开缓存；也直接作为 AudioItem.cacheKey 交给原生（progressive 兼作 SimpleCache 分桶键）
 * 与 mediaKey 一样用 JSON 编码防撞键
 */
export function sourceCacheKey(ref: MediaRef, quality: QualityKey): string {
    return JSON.stringify([ref.platform, ref.id, quality]);
}

/** 插件未声明 maxAge 时的默认缓存时长（秒） */
const DEFAULT_MAX_AGE_SEC = 10 * 60;

/** 缓存条目上限，超出走 LRU 淘汰 */
const MAX_ENTRIES = 1500;

/** streamType 记忆表上限（内存 LRU；独立于源缓存，只记「这首是什么流类型」这一稳定属性） */
const MAX_STREAM_TYPES = 1500;

/**
 * 永久缓存的 maxAgeMs 哨兵：用一个极大有限值代替 Infinity
 * 因为 JSON.stringify(Infinity)==='null'、落盘会坏；MAX_SAFE_INTEGER 既 JSON 安全、又永不到期
 */
const PERMANENT_MS = Number.MAX_SAFE_INTEGER;

/** 缓存 MMKV store id（TODO 待 infra 支持后迁到可再生、不外露的内部 cache 路径） */
const CACHE_STORE_ID = 'Cache.MediaSource';

/**
 * 把插件给的 maxAge（秒）换算成缓存毫秒数
 * < 0（含 -1）或 Infinity = 永久；0 = 从不缓存；> 0 = 该秒数；undefined / NaN / 畸形值 = 默认 10 分钟
 */
function computeMaxAgeMs(maxAge: number | undefined): number {
    if (typeof maxAge !== 'number' || Number.isNaN(maxAge)) {
        return DEFAULT_MAX_AGE_SEC * 1000;
    }
    if (maxAge === Infinity || maxAge < 0) {
        return PERMANENT_MS;
    }
    if (maxAge === 0) {
        return 0;
    }
    const ms = maxAge * 1000;
    // 有限正 TTL 钳到 PERMANENT_MS；溢出成 Infinity 则当永久（防 JSON 落盘变 null）
    return Number.isFinite(ms) ? Math.min(ms, PERMANENT_MS) : PERMANENT_MS;
}

/** 一条缓存：源 + 类型 + 命中音质 + 写入时刻 + 过期时长（类型另存 #streamTypes 供建槽，不随源过期丢） */
interface CacheEntry {
    source: AudioSource;
    streamType: StreamType;
    quality: QualityKey;
    resolvedAt: number;
    maxAgeMs: number;
}

/** 合法的 streamType 字符串（防落盘数据被篡改成非法枚举）；音质校验走 utils 的 isQualityKey */
const VALID_STREAM_TYPES = new Set<string>(['progressive', 'hls', 'dash']);

/** 源是否带鉴权类 header（Authorization / Cookie）——这类不落盘，避免凭证明文持久化 */
function hasSensitiveHeaders(source: AudioSource): boolean {
    const headers = source.headers;
    if (!headers) {
        return false;
    }
    return Object.keys(headers).some(k => {
        const lower = k.toLowerCase();
        return lower === 'authorization' || lower === 'cookie';
    });
}

/** 落盘数据的运行时形状校验（防旧版本 / 损坏 / 篡改数据当好数据读） */
function isValidEntry(value: unknown): value is CacheEntry {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const e = value as Record<string, unknown>;
    const source = e.source as Record<string, unknown> | undefined;
    if (!source || typeof source.url !== 'string' || source.url.length === 0) {
        return false;
    }
    if (source.headers !== undefined) {
        if (typeof source.headers !== 'object' || source.headers === null) {
            return false;
        }
        if (Object.values(source.headers).some(v => typeof v !== 'string')) {
            return false;
        }
    }
    return (
        Number.isFinite(e.resolvedAt) &&
        Number.isFinite(e.maxAgeMs) &&
        (e.maxAgeMs as number) > 0 &&
        typeof e.streamType === 'string' &&
        VALID_STREAM_TYPES.has(e.streamType) &&
        isQualityKey(e.quality)
    );
}

/**
 * 已解析音源缓存：TTL + LRU + MMKV 持久化 + in-flight 去重
 * · 源：maxAge 到期整条删；命中即移到队尾（近用）；超上限先清过期、再从队首（最久未用）淘汰
 * · streamType 另存独立内存表（getStreamType）：不随源过期/no-store 丢，断 hls/dash 重建死循环
 * · 写穿 MMKV + 启动水合：永久 / 未过期的源重启后仍在 → 稳定 CDN 源可离线播、类型回种免重学
 */
export class SourceCache {
    readonly #mmkv = getOrCreateMMKV(CACHE_STORE_ID);
    /** 内存索引，Map 插入序 = 近用序（队首最旧） */
    readonly #entries = new Map<string, CacheEntry>();
    /**
     * streamType 记忆：cacheKey → 类型。独立于源缓存寿命——不随源过期 / no-store(maxAge=0) 丢失，
     * 断开「maxAge=0 的 hls/dash 每次重建又默认 progressive → 无限纠正」死循环。内存有界 LRU、不落盘
     * （跨会话记忆靠源缓存 entry 水合时回种；no-store 源每会话首播纠正一次，可接受）
     */
    readonly #streamTypes = new Map<string, StreamType>();
    readonly #inflight = new Map<string, Promise<ResolvedSource | null>>();

    constructor() {
        this.#hydrate();
    }

    /** 取缓存的已解析源（未命中或已过期返 undefined），命中则标记为最近用 */
    get(cacheKey: string): ResolvedSource | undefined {
        const entry = this.#getFresh(cacheKey);
        if (!entry) {
            return undefined;
        }
        // 命中即回种类型记忆：让类型近用序跟随源，避免两表 LRU 脱同步后「源在、类型失」再陷纠正循环
        this.rememberStreamType(cacheKey, entry.streamType);
        return {
            source: entry.source,
            streamType: entry.streamType,
            quality: entry.quality,
        };
    }

    /**
     * 已记录的 streamType（建 AudioItem 时套用；未命中返 undefined，按默认 progressive 处理）
     * 读独立的内存记忆表：不随源过期 / no-store 丢，故 hls/dash 免每次重学
     */
    getStreamType(cacheKey: string): StreamType | undefined {
        const type = this.#streamTypes.get(cacheKey);
        if (type === undefined) {
            return undefined;
        }
        // 命中移到队尾（近用）
        this.#streamTypes.delete(cacheKey);
        this.#streamTypes.set(cacheKey, type);
        return type;
    }

    /** 记住某源的 streamType（每次成功解析都记，含 maxAge=0 与本地源）；内存有界 LRU */
    rememberStreamType(cacheKey: string, streamType: StreamType): void {
        this.#streamTypes.delete(cacheKey);
        this.#streamTypes.set(cacheKey, streamType);
        while (this.#streamTypes.size > MAX_STREAM_TYPES) {
            const oldest = this.#streamTypes.keys().next().value;
            if (oldest === undefined) {
                break;
            }
            this.#streamTypes.delete(oldest);
        }
    }

    /** 忘记某源的 streamType（E_UNSUPPORTED 后调：如 iOS 记住 DASH 会永久挡在 resolver 前，需清掉重探测） */
    forgetStreamType(cacheKey: string): void {
        this.#streamTypes.delete(cacheKey);
    }

    /** 取未过期条目并标记为最近用；过期则删除返 undefined（get 用；streamType 另走 #streamTypes） */
    #getFresh(cacheKey: string): CacheEntry | undefined {
        const entry = this.#entries.get(cacheKey);
        if (!entry) {
            return undefined;
        }
        if (this.#isExpired(entry)) {
            this.#delete(cacheKey);
            return undefined;
        }
        this.#entries.delete(cacheKey);
        this.#entries.set(cacheKey, entry);
        return entry;
    }

    /** 失效某源（出错重解析用）；只删源、保留已学 streamType（重解析仍按正确类型建槽） */
    invalidate(cacheKey: string): void {
        this.#delete(cacheKey);
    }

    /**
     * 解析入口：命中缓存直接返回；有在途请求则复用其 Promise（去重）；否则跑 factory、按 maxAge 写缓存
     * factory 返回 null 或抛错都算失败、不写缓存；in-flight 无论成败都在 finally 清掉
     */
    async resolveWith(
        cacheKey: string,
        factory: () => Promise<{
            resolved: ResolvedSource;
            maxAge?: number;
        } | null>,
    ): Promise<ResolvedSource | null> {
        const cached = this.get(cacheKey);
        if (cached) {
            return cached;
        }
        const existing = this.#inflight.get(cacheKey);
        if (existing) {
            return existing;
        }
        const task = (async (): Promise<ResolvedSource | null> => {
            let result: { resolved: ResolvedSource; maxAge?: number } | null;
            try {
                result = await factory();
            } catch {
                result = null;
            }
            if (!result) {
                return null;
            }
            // 每次成功解析都记类型（含 maxAge=0 不落盘的源），供后续建槽免重学
            this.rememberStreamType(cacheKey, result.resolved.streamType);
            this.#put(cacheKey, result.resolved, result.maxAge);
            return result.resolved;
        })();
        this.#inflight.set(cacheKey, task);
        try {
            return await task;
        } finally {
            this.#inflight.delete(cacheKey);
        }
    }

    #isExpired(entry: CacheEntry): boolean {
        return Date.now() - entry.resolvedAt >= entry.maxAgeMs;
    }

    /** 写缓存；maxAge=0 从不缓存；带鉴权头的源只进内存不落盘（避免凭证明文持久化） */
    #put(
        cacheKey: string,
        resolved: ResolvedSource,
        maxAge: number | undefined,
    ): void {
        const maxAgeMs = computeMaxAgeMs(maxAge);
        if (maxAgeMs === 0) {
            return;
        }
        const entry: CacheEntry = {
            source: resolved.source,
            streamType: resolved.streamType,
            quality: resolved.quality,
            resolvedAt: Date.now(),
            maxAgeMs,
        };
        this.#entries.delete(cacheKey);
        this.#entries.set(cacheKey, entry);
        if (!hasSensitiveHeaders(entry.source)) {
            // 落盘失败不能牽连播放：吞掉持久化异常，内存缓存照常
            try {
                setObject(this.#mmkv, cacheKey, entry);
            } catch {
                // MMKV 写失败，退化为仅内存
            }
        }
        this.#evictIfNeeded();
    }

    #delete(cacheKey: string): void {
        this.#entries.delete(cacheKey);
        try {
            this.#mmkv.remove(cacheKey);
        } catch {
            // 忽略落盘删除失败
        }
    }

    /** 超上限淘汰：先清已过期，仍超再从队首（最久未用）删 */
    #evictIfNeeded(): void {
        if (this.#entries.size <= MAX_ENTRIES) {
            return;
        }
        for (const [key, entry] of this.#entries) {
            if (this.#entries.size <= MAX_ENTRIES) {
                break;
            }
            if (this.#isExpired(entry)) {
                this.#delete(key);
            }
        }
        while (this.#entries.size > MAX_ENTRIES) {
            const oldest = this.#entries.keys().next().value;
            if (oldest === undefined) {
                break;
            }
            this.#delete(oldest);
        }
    }

    /** 启动水合：从 MMKV 载入未过期 + 合法的条目，顺手清掉过期 / 损坏的；持久化异常降级为空内存缓存、不阻断装配 */
    #hydrate(): void {
        try {
            for (const key of this.#mmkv.getAllKeys()) {
                const entry = getObject<unknown>(this.#mmkv, key);
                if (!isValidEntry(entry) || this.#isExpired(entry)) {
                    this.#mmkv.remove(key);
                    continue;
                }
                this.#entries.set(key, entry);
                // 回种 streamType 记忆（走 rememberStreamType 以套用 MAX_STREAM_TYPES 上限）：持久化源的类型跨会话记住，减少启动首播纠正
                this.rememberStreamType(key, entry.streamType);
            }
            this.#evictIfNeeded();
        } catch {
            // 水合失败：以空内存缓存起步，不牽连 player / 容器装配
        }
    }
}
