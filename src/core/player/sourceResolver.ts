import { exists } from '@dr.pogodin/react-native-fs';
import CryptoJS from 'crypto-js';
import { URL as WhatwgURL } from 'react-native-url-polyfill';

import { getNetworkClass, onNetworkClassChange } from '@/infra/network';
import { delay, TimeoutError, withTimeout } from '@/infra/timer';
import { StreamType, type AudioSource } from '@/native/audioEngine';
import { localPathToUri, isLocalPlatform, QUALITY_KEYS } from '@/utils/media';
import { minDistance } from '@/utils/text';

import {
    SourceCache,
    sourceCacheKey,
    type ResolvedSource,
} from './sourceCache';

import type { IConfig } from '@/core/config';
import type { IMediaMeta } from '@/core/mediaMeta';
import type { IPluginManager, Plugin } from '@/core/plugin';
import type { NetworkClass } from '@/infra/network';
import type { MediaSource, MusicItem, QualityKey } from '@/types';

/** 相似歌搜索时每个插件取前几条候选 */
const SIMILAR_CANDIDATES = 2;

/** 单次跨插件搜索的超时（毫秒） */
const SEARCH_TIMEOUT_MS = 8000;

/** 标题匹配阈值：归一化编辑距离比例超过它就认为不是同一首，宁缺毋滥 */
const MATCH_DISTANCE_RATIO = 0.5;

/** 单次 getMediaSource 超时（毫秒） */
const GETMEDIASOURCE_TIMEOUT_MS = 10000;

/** 一整次解析的总预算（毫秒），须显著小于原生 25s（防插件挂死占住 in-flight） */
const RESOLVE_BUDGET_MS = 20000;

/** 本地文件存在性探测的上限（毫秒）：本地盘应瞬回，超过就当不可用、别拖垮整次解析 */
const LOCAL_PROBE_TIMEOUT_MS = 1500;

/** 网络归类补查的上限（毫秒）：桥挂死不能把整次解析拖到原生兜底才失败 */
const NETWORK_PROBE_TIMEOUT_MS = 1500;

/** getMediaSource 出错后重试前的延时（毫秒，对齐 legacy） */
const RETRY_DELAY_MS = 150;

/** 一个候选解析结果：可播音源 + 用于定缓存 TTL 的 maxAge */
type Candidate = { resolved: ResolvedSource; maxAge?: number };

/**
 * 一次 getMediaSource 调用的结果：拿到源 / 这一档没有源（插件正常返回空）/ 插件抛错 / 超时或预算耗尽
 * 抛错与超时要分开：插件对某一档抛错很常见（非会员拿 high / super 多半是 403），换一档往往能播，该继续回退；
 * 超时则说明插件后端卡住了，别的档走的是同一个后端，再试只会把剩下的预算也耗光
 */
type GetMediaSourceResult =
    | { kind: 'source'; source: MediaSource }
    | { kind: 'none' }
    | { kind: 'error' }
    | { kind: 'timeout' };

/**
 * 生成音质回退顺序：从目标音质开始，按方向（asc=优先更高、desc=优先更低）依次尝试
 * 例：目标 standard、asc → [standard, high, super, low]
 */
function getQualityFallbackOrder(
    target: QualityKey,
    direction: 'asc' | 'desc',
): QualityKey[] {
    const t = QUALITY_KEYS.indexOf(target);
    if (t < 0) {
        return [...QUALITY_KEYS];
    }
    const higher = QUALITY_KEYS.slice(t + 1); // 比目标高，升序
    const lower = QUALITY_KEYS.slice(0, t).reverse(); // 比目标低，降序（就近优先）
    return direction === 'asc'
        ? [target, ...higher, ...lower]
        : [target, ...lower, ...higher];
}

/**
 * 按 URL 后缀判流类型：.m3u8→hls、.mpd→dash、其余→progressive
 * 先手动剥掉 query/fragment 再看后缀，不依赖 RN 简化的 URL 实现（它对大写 scheme / 协议相对 URL 会漏判）
 * TODO iOS 引擎暂不支持 DASH，.mpd 在 iOS 会 E_UNSUPPORTED；需要时按平台能力跳过 dash 候选
 */
function detectStreamType(url: string): StreamType {
    const clean = (url.split('#')[0]?.split('?')[0] ?? '').toLowerCase();
    if (clean.endsWith('.m3u8')) {
        return StreamType.Hls;
    }
    if (clean.endsWith('.mpd')) {
        return StreamType.Dash;
    }
    return StreamType.Progressive;
}

/** 旧插件的 cacheControl → maxAge 映射：cache=永久(-1)、no-store=不缓存(0)、其余(含 no-cache)=默认 */
function mapLegacyCacheControlToMaxAge(
    cacheControl: 'cache' | 'no-cache' | 'no-store' | undefined,
): number | undefined {
    switch (cacheControl) {
        case 'cache':
            return -1;
        case 'no-store':
            return 0;
        default:
            return undefined;
    }
}

/** 某 header 是否已存在（大小写不敏感） */
function hasHeaderCI(headers: Record<string, string>, name: string): boolean {
    const lower = name.toLowerCase();
    return Object.keys(headers).some(k => k.toLowerCase() === lower);
}

/**
 * 本地文件这次在不在（只查存在性，不保证能打开读）
 * 只服务本次播放决策，**不写任何持久化**：SD 卡未挂载、权限被撤、云盘占位文件都会探测失败，
 * 但文件其实还在——据此清掉用户的下载记录风险远大于收益。真正的收敛交给扫描与用户显式操作
 * 也不缓存结果：用户可能刚在文件管理器里把它删了
 */
async function fileExists(path: string, budgetMs: number): Promise<boolean> {
    try {
        // 限时：失效的网络挂载点 / 云盘占位路径可能卡住，不能让它吃掉整次解析预算
        return await withTimeout(
            exists(path),
            Math.min(LOCAL_PROBE_TIMEOUT_MS, Math.max(budgetMs, 0)),
        );
    } catch {
        return false; // 探测失败 / 超时（权限、存储卸载）同样按不可用处理，落回联网
    }
}

/** 从 http(s)://user:pass@host 抽出 basic auth，返回去掉凭证的 url + Authorization 值（无凭证则原样） */
function formatAuthUrl(url: string): { url: string; auth?: string } {
    try {
        const parsed = new WhatwgURL(url);
        if (parsed.username && parsed.password) {
            const cred = `${decodeURIComponent(
                parsed.username,
            )}:${decodeURIComponent(parsed.password)}`;
            const auth = `Basic ${CryptoJS.enc.Base64.stringify(
                CryptoJS.enc.Utf8.parse(cred),
            )}`;
            parsed.username = '';
            parsed.password = '';
            return { url: parsed.toString(), auth };
        }
    } catch {
        // 解析失败，原样返回
    }
    return { url };
}

/** 把插件返回的 MediaSource 收成引擎要的 AudioSource；无有效 url（含纯空白）返 null；userAgent / URL 内 basic auth 并进 headers */
function buildAudioSource(ms: MediaSource): AudioSource | null {
    const raw = typeof ms.url === 'string' ? ms.url.trim() : '';
    if (raw.length === 0) {
        return null;
    }
    const { url, auth } = formatAuthUrl(raw);
    const headers: Record<string, string> = { ...(ms.headers ?? {}) };
    if (ms.userAgent && !hasHeaderCI(headers, 'user-agent')) {
        headers['User-Agent'] = ms.userAgent;
    }
    if (auth && !hasHeaderCI(headers, 'authorization')) {
        headers.Authorization = auth;
    }
    return {
        url,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
    };
}

/** 去掉空白并转小写，用于模糊匹配；非字符串字段按空串处理（防插件返回畸形数据抛错） */
function normalize(s: unknown): string {
    return (typeof s === 'string' ? s : '').toLowerCase().replace(/\s+/g, '');
}

/** 归一化编辑距离比例：0=完全相同、1=完全不同；两边都空返 1（最差） */
function distanceRatio(a: string, b: string): number {
    const maxLen = Math.max(a.length, b.length);
    return maxLen === 0 ? 1 : minDistance(a, b) / maxLen;
}

/**
 * 从候选里挑与目标最像的一首：标题必须足够像（主判据），歌手作次判据
 * 标题分开算比例，避免“同歌手不同歌”被稀释接受；目标无标题或候选标题都不像则无匹配
 */
function pickBestMatch(
    item: MusicItem,
    candidates: MusicItem[],
): MusicItem | null {
    const targetTitle = normalize(item.title);
    if (targetTitle.length === 0) {
        return null;
    }
    const targetArtist = normalize(item.artist);
    let best: MusicItem | null = null;
    let bestScore = Infinity;
    for (const c of candidates) {
        const titleRatio = distanceRatio(normalize(c.title), targetTitle);
        if (titleRatio > MATCH_DISTANCE_RATIO) {
            continue; // 标题都不像，直接跳过
        }
        const score =
            titleRatio + distanceRatio(normalize(c.artist), targetArtist);
        if (score < bestScore) {
            bestScore = score;
            best = c;
        }
    }
    return best;
}

export interface SourceResolverDeps {
    pluginManager: IPluginManager;
    mediaMeta: IMediaMeta;
    config: IConfig;
    cache: SourceCache;
}

export interface ResolveOptions {
    /**
     * 允许相似歌兑底：跨插件模糊搜索换一首能播的（仅播放开启；下载不换歌，模糊匹配可能拿到不同的歌）
     * 注意：替代源是「同一首换解析器」、不换歌，不受此开关限制
     */
    allowSimilarFallback?: boolean;
    /**
     * 本次播放优先使用的本地文件（裸路径）；仅属于当前 slot，不进入 MusicItem / 队列 / 会话
     * 文件不可用时照常回退 mediaMeta 锚点与联网解析
     */
    preferredLocalPath?: string;
}

/**
 * 解析没拿到音源的原因
 * - `unavailable` 插件 / 内嵌 / 相似歌兜底都给不出可播地址
 * - `cellularBlocked` 流量闸拦下：不是这首歌有问题，换一首同样过不去
 */
export type SourceFailureReason = 'unavailable' | 'cellularBlocked';

/** 音源解析结果：拿到源，或没拿到并给出原因 */
export type SourceOutcome =
    | { ok: true; source: ResolvedSource }
    | { ok: false; reason: SourceFailureReason };

/**
 * 音源解析：把一首 MusicItem 解析成可播音源
 * 顺序：本地文件 → 流量闸 → 替代源或本插件按音质回退 → MusicItem 自带内嵌/直链 → 相似歌兜底
 * 结果走 SourceCache（TTL 缓存 + in-flight 去重 + streamType 记忆）
 */
export class SourceResolver {
    readonly #plugins: IPluginManager;
    readonly #mediaMeta: IMediaMeta;
    readonly #config: IConfig;
    readonly #cache: SourceCache;
    /** 当前网络归类；订阅首报到达前是 unknown，届时按需现查一次 */
    #network: NetworkClass = 'unknown';

    constructor(deps: SourceResolverDeps) {
        this.#plugins = deps.pluginManager;
        this.#mediaMeta = deps.mediaMeta;
        this.#config = deps.config;
        this.#cache = deps.cache;
        // 单例常驻，退订函数不保留
        onNetworkClassChange(next => {
            this.#network = next;
        });
    }

    async resolve(
        item: MusicItem,
        quality: QualityKey,
        opts?: ResolveOptions,
    ): Promise<SourceOutcome> {
        // TODO 缓存键既作解析结果 memo、又作 AudioItem.cacheKey（原生字节桶）；音质回退 / 相似歌换歌后实际来源可能不同，
        //      且不区分 allowSimilarFallback。下载轮(strict) / 多音质字节隔离接入前需拆分 memo key 与字节 key
        const cacheKey = sourceCacheKey(item, quality);
        // 总预算在任何 I/O 之前起算：本地探测也是 I/O，不能白送它一段不计时的时间
        const deadline = Date.now() + RESOLVE_BUDGET_MS;
        // 显式路径优先，其次下载、扫描候选；同路径只探测一次，保留已知音质
        const preferredLocalPath = opts?.preferredLocalPath;
        const anchored = this.#mediaMeta.getLocalFiles(item);
        const localCandidates = [
            ...(preferredLocalPath
                ? [
                      anchored.find(
                          local => local.path === preferredLocalPath,
                      ) ?? { path: preferredLocalPath, quality: undefined },
                  ]
                : []),
            ...anchored.filter(local => local.path !== preferredLocalPath),
        ];
        for (const local of localCandidates) {
            if (!(await fileExists(local.path, deadline - Date.now()))) {
                continue;
            }
            // 本地文件恒 progressive；记进类型记忆表（覆盖旧的联网类型，如曾记 hls 后下载为本地）
            this.#cache.rememberStreamType(cacheKey, StreamType.Progressive);
            return {
                ok: true,
                source: {
                    source: { url: localPathToUri(local.path) },
                    streamType: StreamType.Progressive,
                    // 本地文件的实际音质；扫描来的文件无音质档概念，此时回显请求档
                    quality: local.quality ?? quality,
                },
            };
        }
        // 往下每条路都要花流量——缓存里那条 URL 也一样，放它照样是联网串流
        if (await this.#blockedByCellular(item)) {
            return { ok: false, reason: 'cellularBlocked' };
        }
        const resolved = await this.#cache.resolveWith(cacheKey, () =>
            this.#select(item, quality, opts ?? {}, deadline),
        );
        if (!resolved) {
            return { ok: false, reason: 'unavailable' };
        }
        // 解析最长可跑 20s，期间可能已从 Wi-Fi 切到流量；源还没开播，此时拦仍来得及
        if (await this.#blockedByCellular(item)) {
            return { ok: false, reason: 'cellularBlocked' };
        }
        return { ok: true, source: resolved };
    }

    /**
     * 流量闸：开关关且当前连接要花流量即拦
     * unknown 一并拦——系统说「判不出来」不等于「不花流量」，赌错就是用户的流量
     */
    async #blockedByCellular(item: MusicItem): Promise<boolean> {
        if (this.#config.get('basic.useCelluarNetworkPlay') ?? false) {
            return false;
        }
        // 本地曲库的歌恒是 file://（localPlugin 直接回 item.url）：mediaMeta 锚点丢了也不该按联网拦，
        // 否则文件其实还在却提示「已关闭移动网络播放」，或文件真没了却报错原因
        if (isLocalPlatform(item.platform)) {
            return false;
        }
        if (this.#network === 'unknown') {
            await this.#probeNetwork();
        }
        return this.#network !== 'nonCellular';
    }

    /**
     * 补查一次当前网络：netinfo 订阅首报是异步的，冷启动自动续播正落在这个窗口里，
     * 不补查会把 Wi-Fi 误判成流量、一开机就拦掉续播
     * 查不出 / 超时一律维持 unknown（即拦），宁可误拦不误花流量
     */
    async #probeNetwork(): Promise<void> {
        let probed: NetworkClass;
        try {
            probed = await withTimeout(
                getNetworkClass(),
                NETWORK_PROBE_TIMEOUT_MS,
            );
        } catch {
            return;
        }
        // 等待期间订阅报了新值就以订阅为准：它比这次快照新
        if (this.#network === 'unknown') {
            this.#network = probed;
        }
    }

    async #select(
        item: MusicItem,
        quality: QualityKey,
        opts: ResolveOptions,
        deadline: number,
    ): Promise<Candidate | null> {
        // 1. 有效解析插件：配了替代源（且它能解析）就换成它喂同一 item，否则本插件（parser-swap，对齐 legacy）
        const altPlatform = this.#plugins.getAlternative(item.platform);
        const altPlugin = altPlatform
            ? this.#plugins.getByPlatform(altPlatform)
            : undefined;
        const parser = altPlugin?.supportedMethods.has('getMediaSource')
            ? altPlugin
            : this.#plugins.getByMediaItem(item);
        if (parser) {
            const r = await this.#tryPluginSource(
                parser,
                item,
                quality,
                deadline,
            );
            if (r) {
                return r;
            }
        }
        // 2. MusicItem 自带内嵌音源 / 直链兜底
        const embedded = this.#tryEmbedded(item, quality);
        if (embedded) {
            return embedded;
        }
        // 3. 相似歌兜底：跨启用插件模糊搜索换一首能播的（仅播放 + 配置开启）
        if (
            opts.allowSimilarFallback &&
            (this.#config.get('basic.tryChangeSourceWhenPlayFail') ?? false) &&
            Date.now() < deadline
        ) {
            const r = await this.#trySimilar(item, quality, deadline);
            if (r) {
                return r;
            }
        }
        return null;
    }

    /** 在给定插件上按音质回退链调 getMediaSource */
    async #tryPluginSource(
        plugin: Plugin,
        item: MusicItem,
        quality: QualityKey,
        deadline: number,
    ): Promise<Candidate | null> {
        if (!plugin.supportedMethods.has('getMediaSource')) {
            return null;
        }
        // TODO 错误恢复的“已试候选”上下文（跳过失败过的 url/音质/插件继续回退）在 slots 错误处理处接入
        const direction = this.#config.get('basic.playQualityOrder') ?? 'asc';
        const order = getQualityFallbackOrder(quality, direction);
        for (const [index, q] of order.entries()) {
            if (Date.now() >= deadline) {
                return null;
            }
            // 抛错只给链上第一档重试一次：后面各档单发。四档各打两遍会把一个坏插件放大成八次请求
            // （用户反馈「一秒几十个请求」的一层来源），而回退到下一档本身就是对同一后端的又一次尝试
            const result = await this.#callGetMediaSource(
                plugin,
                item,
                q,
                deadline,
                index === 0,
            );
            if (result.kind === 'timeout') {
                return null; // 后端卡住：别的档走同一后端，再试只会耗光预算
            }
            if (result.kind === 'none' || result.kind === 'error') {
                continue; // 这一档没有 / 这一档报错：换下一档
            }
            const ms = result.source;
            const source = buildAudioSource(ms);
            if (source) {
                return {
                    resolved: {
                        source,
                        streamType: detectStreamType(source.url),
                        quality: ms.quality ?? q,
                    },
                    maxAge:
                        ms.maxAge ??
                        mapLegacyCacheControlToMaxAge(
                            plugin.definition?.cacheControl,
                        ),
                };
            }
        }
        return null;
    }

    /**
     * 调 getMediaSource：超时按剩余预算裁剪；超时不重试（重试也会超时、白耗预算）；
     * 其它错误在 retryOnError 时 background 延时后重试一次，否则原样报 error 交回退链处理
     * 预算耗尽按 timeout 处理：没机会再试别的音质了
     */
    async #callGetMediaSource(
        plugin: Plugin,
        item: MusicItem,
        quality: QualityKey,
        deadline: number,
        retryOnError: boolean,
    ): Promise<GetMediaSourceResult> {
        for (let attempt = 0; attempt < 2; attempt++) {
            const remaining = deadline - Date.now();
            if (remaining <= 0) {
                return { kind: 'timeout' };
            }
            try {
                const source = await withTimeout(
                    plugin.methods.getMediaSource(item, quality),
                    Math.min(GETMEDIASOURCE_TIMEOUT_MS, remaining),
                );
                return source ? { kind: 'source', source } : { kind: 'none' };
            } catch (e) {
                if (e instanceof TimeoutError) {
                    return { kind: 'timeout' };
                }
                if (
                    retryOnError &&
                    attempt === 0 &&
                    deadline - Date.now() > RETRY_DELAY_MS
                ) {
                    await delay(RETRY_DELAY_MS, { runInBackground: true });
                } else {
                    return { kind: 'error' };
                }
            }
        }
        return { kind: 'error' };
    }

    /** MusicItem 自带的内嵌音源（item.source[q]）或直链（item.url）兜底 */
    #tryEmbedded(item: MusicItem, quality: QualityKey): Candidate | null {
        const direction = this.#config.get('basic.playQualityOrder') ?? 'asc';
        for (const q of getQualityFallbackOrder(quality, direction)) {
            // 内嵌音源（source[q]，可能带 headers）优先
            const embed = item.source?.[q];
            const embedSource = embed ? buildAudioSource(embed) : null;
            if (embed && embedSource) {
                return {
                    resolved: {
                        source: embedSource,
                        streamType: detectStreamType(embedSource.url),
                        quality: embed.quality ?? q,
                    },
                    maxAge: embed.maxAge,
                };
            }
            // 静态音质表里的直链（qualities[q].url，legacy 路径）
            const qualityUrl = item.qualities?.[q]?.url;
            const qualitySource =
                typeof qualityUrl === 'string'
                    ? buildAudioSource({ url: qualityUrl })
                    : null;
            if (qualitySource) {
                return {
                    resolved: {
                        source: qualitySource,
                        streamType: detectStreamType(qualitySource.url),
                        quality: q,
                    },
                };
            }
        }
        const direct =
            typeof item.url === 'string'
                ? buildAudioSource({ url: item.url })
                : null;
        if (direct) {
            return {
                resolved: {
                    source: direct,
                    streamType: detectStreamType(direct.url),
                    // 通用直链无音质信息，归 standard（对齐 legacy），不冒充请求音质
                    quality: 'standard',
                },
            };
        }
        return null;
    }

    /** 在别的插件里搜同一首、取最佳匹配、再解析其音源 */
    async #resolveForeign(
        plugin: Plugin,
        item: MusicItem,
        quality: QualityKey,
        deadline: number,
    ): Promise<Candidate | null> {
        if (
            !plugin.supportedMethods.has('search') ||
            !plugin.supportedMethods.has('getMediaSource')
        ) {
            return null;
        }
        const query = item.alias || item.title;
        if (!query) {
            return null;
        }
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
            return null;
        }
        let candidates: MusicItem[];
        try {
            const result = await withTimeout(
                plugin.methods.search(query, 1, 'music'),
                Math.min(SEARCH_TIMEOUT_MS, remaining),
            );
            candidates = (result?.data ?? []).slice(0, SIMILAR_CANDIDATES);
        } catch {
            return null;
        }
        const match = pickBestMatch(item, candidates);
        if (!match) {
            return null;
        }
        return this.#tryPluginSource(plugin, match, quality, deadline);
    }

    /** 相似歌兜底：遍历启用的其它插件，第一个能解析出源的胜出 */
    async #trySimilar(
        item: MusicItem,
        quality: QualityKey,
        deadline: number,
    ): Promise<Candidate | null> {
        const others = this.#plugins
            .getAll()
            .filter(
                p =>
                    p.platform !== item.platform &&
                    this.#plugins.isEnabled(p.platform) &&
                    p.supportedMethods.has('search') &&
                    p.supportedMethods.has('getMediaSource'),
            );
        for (const plugin of others) {
            if (Date.now() >= deadline) {
                return null;
            }
            const r = await this.#resolveForeign(
                plugin,
                item,
                quality,
                deadline,
            );
            if (r) {
                return r;
            }
        }
        return null;
    }
}
