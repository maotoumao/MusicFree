/**
 * 歌词管理器：切歌取词 + 解析 + 当前行同步；状态经 atoms 发布给 UI
 * 取词优先用户手动关联的歌词，否则走当前歌所属插件（本地歌经 localPlugin 同一条）；解析走 parser（纯计算）
 * 插件词经 fileStore 的文件缓存，命中即不联网——离线仍有词，插件失效后听过的歌也还留着
 */
import { withTimeout } from '@/infra/timer';
import { isSameMediaRef } from '@/utils/media';
import { clampToMaxLength, minDistance } from '@/utils/text';

import {
    deleteCustomLyric,
    pruneLyricCache,
    readCachedLyric,
    readCustomLyric,
    writeCachedLyric,
    writeCachedMiss,
    writeCustomLyric,
} from './fileStore';
import { findActiveLine, parseLyric } from './parser';
import {
    NO_ACTIVE_LINE,
    NO_LYRIC_OFFSET,
    publishLyricOffset,
    setCurrentLine,
    setLyricState,
    subscribeLyricContent as subscribeContent,
} from './store';

import type {
    EffectiveLyric,
    ILyric,
    LyricContent,
    LyricDeps,
    LyricMeta,
    LyricOrigin,
    LyricState,
    LyricStatus,
    LyricText,
} from './types';
import type { IConfig } from '@/core/config';
import type { IMediaMeta } from '@/core/mediaMeta';
import type { IPlayer } from '@/core/player';
import type { IPluginManager } from '@/core/plugin';
import type { Progress } from '@/native/audioEngine';
import type { MusicItem, LyricOverride, ParsedLyric, RawLyric } from '@/types';

/** 没有用户指定时的来源；常量复用，避免每次取词造新对象 */
const PLUGIN_ORIGIN: LyricOrigin = { kind: 'plugin' };

/** 每个歌词源只看搜索结果最靠前的候选，避免为弱相关结果发大量取词请求 */
const SIMILAR_CANDIDATES = 2;

/** 单次插件搜索 / 取词的最长等待时间 */
const AUTO_SEARCH_STEP_TIMEOUT_MS = 5000;

/** 一轮自动搜索的总预算 */
const AUTO_SEARCH_BUDGET_MS = 15000;

/** 标题归一化编辑距离比例超过此值即拒绝，宁缺毋滥 */
const LYRIC_MATCH_DISTANCE_RATIO = 0.5;

/** 编辑距离是 O(mn)，超过此长度的文本仅接受完整相等，避免不可信字段阻塞 JS */
const MATCH_TEXT_MAX_LENGTH = 256;

/**
 * 单份歌词文本的长度上限（UTF-16 码元），正文与译文各自计算
 * 十万码元约合三万行 LRC，正常歌词远够用；这道闸是拦住误粘贴整本小说，
 * 免得一份文本把侧表读写和解析拖垮
 */
export const LYRIC_MAX_LENGTH = 100_000;

const LOADING_STATE: LyricState = {
    status: 'loading',
    lines: [],
    meta: {},
    hasTranslation: false,
    timed: false,
    origin: PLUGIN_ORIGIN,
};

const UNAVAILABLE_STATE: LyricState = {
    status: 'unavailable',
    lines: [],
    meta: {},
    hasTranslation: false,
    timed: false,
    origin: PLUGIN_ORIGIN,
};

/**
 * 把插件返回的原始歌词归一为可落盘的文本；解析不出可显示的行时返回 null
 *
 * 判「到底有没有词」必须真解析一次，不能只看 rawLrc 非空：插件可能返回一串空白，
 * 或只有 [ti:]/[ar:] 标签的空壳。把这些当成有词缓存下来，之后每次都是空白画布且不再联网
 */
function toStoredText(raw: RawLyric | null): LyricText | null {
    const rawLrc = typeof raw?.rawLrc === 'string' ? raw.rawLrc : '';
    const translation =
        typeof raw?.translation === 'string' ? raw.translation : undefined;
    if (parseLyric(rawLrc, { translation }).lines.length === 0) {
        return null;
    }
    return translation === undefined ? { rawLrc } : { rawLrc, translation };
}

/**
 * 由存储的覆盖标记推出来源，用于取词落地前先标注 loading 态
 *
 * custom 的文件还在不在要读盘才知道，这里先按 custom 记，确认缺失后再由取词降回 plugin
 */
function originOf(override: LyricOverride | undefined): LyricOrigin {
    if (override?.kind === 'associated') {
        return { kind: 'associated', musicItem: override.musicItem };
    }
    if (override?.kind === 'custom') {
        return { kind: 'custom' };
    }
    return PLUGIN_ORIGIN;
}

/** 去空白并转小写；插件返回的畸形字段按空串处理 */
function normalizeMatchText(value: unknown): string {
    return (typeof value === 'string' ? value : '')
        .toLowerCase()
        .replace(/\s+/g, '');
}

/** 搜索标题：非空 alias 优先，否则回落 title；查询和 matcher 必须共用同一选择规则 */
function searchTitleOf(item: MusicItem): string {
    const alias = typeof item.alias === 'string' ? item.alias.trim() : '';
    if (alias) {
        return alias;
    }
    return typeof item.title === 'string' ? item.title.trim() : '';
}

/** 归一化编辑距离比例：0=相同、1=完全不同；两边都空按最差处理 */
function matchDistanceRatio(a: string, b: string): number {
    const maxLength = Math.max(a.length, b.length);
    if (maxLength === 0) {
        return 1;
    }
    if (a === b) {
        return 0;
    }
    if (maxLength > MATCH_TEXT_MAX_LENGTH) {
        return 1;
    }
    return minDistance(a, b) / maxLength;
}

/** 自动搜索依赖的匹配字段是否发生了实质变化 */
function searchMetadataChanged(
    previous: MusicItem,
    current: MusicItem,
): boolean {
    return (
        normalizeMatchText(searchTitleOf(previous)) !==
            normalizeMatchText(searchTitleOf(current)) ||
        normalizeMatchText(previous.artist) !==
            normalizeMatchText(current.artist)
    );
}

/** 从单个歌词源的候选中选最接近目标的一首；标题是门槛，歌手只负责择优 */
function pickBestLyricMatch(
    target: MusicItem,
    candidates: readonly MusicItem[],
): MusicItem | null {
    const targetTitle = normalizeMatchText(searchTitleOf(target));
    if (!targetTitle) {
        return null;
    }
    const targetArtist = normalizeMatchText(target.artist);
    let best: MusicItem | null = null;
    let bestScore = Infinity;
    for (const candidate of candidates) {
        const titleRatio = matchDistanceRatio(
            normalizeMatchText(candidate.title),
            targetTitle,
        );
        if (titleRatio > LYRIC_MATCH_DISTANCE_RATIO) {
            continue;
        }
        const score =
            titleRatio +
            matchDistanceRatio(
                normalizeMatchText(candidate.artist),
                targetArtist,
            );
        if (score < bestScore) {
            best = candidate;
            bestScore = score;
        }
    }
    return best;
}

export class Lyric implements ILyric {
    readonly #config: IConfig;
    readonly #player: IPlayer;
    readonly #pluginManager: IPluginManager;
    readonly #mediaMeta: IMediaMeta;

    #started = false;
    /** 当前播放歌（player 快照）：识别单曲循环同曲重触发 + 关联/解除后据当前对象重取 */
    #currentRef: MusicItem | null = null;
    /** 取词代次：每次切歌自增，取词回来对不上就丢弃（防竞态） */
    #generation = 0;
    /** 当前已加载的歌词行，供进度同步查找 */
    #lines: ParsedLyric = [];
    /** 当前歌词是否含真实时间轴（纯文本无当前行概念、不同步） */
    #timed = false;
    /** 从 LRC [offset:] 解析出的时间轴偏移，单位为秒 */
    #metaOffset = 0;
    /** 用户手动偏移，单位为秒，正值表示提前；与 #metaOffset 合成为有效偏移 */
    #userOffset = 0;
    /** 当前高亮行下标，兼作 findActiveLine 的查找提示 */
    #currentLineIndex = -1;
    /** 当前内容状态；配置即时生效只在 unavailable 时主动重载，避免打断正常 loading */
    #status: LyricStatus = 'unavailable';
    /** 正在自动搜索的取词代次；关闭开关时只打断这一条链 */
    #autoSearchGeneration: number | null = null;

    constructor(deps: LyricDeps) {
        this.#config = deps.config;
        this.#player = deps.player;
        this.#pluginManager = deps.pluginManager;
        this.#mediaMeta = deps.mediaMeta;
    }

    setup(): void {
        if (this.#started) {
            return;
        }
        this.#started = true;
        this.#player.subscribeCurrentMusic(this.#handleCurrentMusic);
        this.#player.subscribeProgress(this.#handleProgress);
        this.#config.subscribe(
            ['lyric.autoSearchLyric'],
            this.#handleAutoSearchConfigChange,
        );
        // 淘汰上次会话攒下的超量缓存；单次会话新增的量远到不了上限，故只在启动清一次
        pruneLyricCache().catch(() => {});
    }

    #handleCurrentMusic = (item: MusicItem | null): void => {
        // 同一首歌再次回调（单曲循环、播放中补全信息等）：保留歌词、只按新位置重同步当前行；
        // 仍把 #currentRef 更新为最新对象——player 可能补全了字段（如本地歌 artist/album），关联重取要用最新的
        if (
            item &&
            this.#currentRef &&
            isSameMediaRef(item, this.#currentRef)
        ) {
            const previous = this.#currentRef;
            this.#currentRef = item;
            if (
                this.#autoSearchGeneration === this.#generation &&
                searchMetadataChanged(previous, item)
            ) {
                this.#refetchIfCurrent(item).catch(() => {});
                return;
            }
            this.#syncLine(this.#player.getProgress().position);
            return;
        }
        this.#currentRef = item;
        this.#generation += 1;
        this.#lines = [];
        this.#timed = false;
        this.#metaOffset = 0;
        this.#userOffset = 0;
        this.#currentLineIndex = -1;
        setCurrentLine(NO_ACTIVE_LINE);
        publishLyricOffset(NO_LYRIC_OFFSET);
        if (!item) {
            this.#status = 'unavailable';
            setLyricState(UNAVAILABLE_STATE);
            return;
        }
        // loading 态由 #loadCurrentLyric 同步发布（它要先读覆盖标记才知道来源）
        this.#loadCurrentLyric(item, this.#generation).catch(() => {});
    };

    async #loadCurrentLyric(
        item: MusicItem,
        generation: number,
    ): Promise<void> {
        // 先按存储标记发布 loading 的来源：取词可能迟迟不结算（关联曲的插件挂了等），
        // 期间 UI 也要知道这首已被指定过来源，否则「恢复默认歌词」入口一直藏着、失效的关联解不掉
        const override = this.#mediaMeta.getLyricOverride(item);
        let origin: LyricOrigin = originOf(override);
        this.#status = 'loading';
        setLyricState({ ...LOADING_STATE, origin });
        let lines: ParsedLyric = [];
        let meta: LyricMeta = {};
        let timed = false;
        try {
            let resolved = await this.#resolveLyric(item, override);
            // 本源取词期间已切歌 / 重取：过期链不能再写自动搜索代次，避免覆盖当前曲的搜索标记
            if (generation !== this.#generation) {
                return;
            }
            if (
                !resolved.text &&
                resolved.origin.kind === 'plugin' &&
                (this.#config.get('lyric.autoSearchLyric') ?? false)
            ) {
                const current = this.#currentRef;
                const searchItem =
                    current && isSameMediaRef(current, item) ? current : item;
                this.#autoSearchGeneration = generation;
                try {
                    const text = await this.#searchSimilarLyric(
                        searchItem,
                        generation,
                    );
                    if (text) {
                        resolved = { text, origin: PLUGIN_ORIGIN };
                    }
                } finally {
                    if (this.#autoSearchGeneration === generation) {
                        this.#autoSearchGeneration = null;
                    }
                }
            }
            origin = resolved.origin;
            const parsed = this.#parseSource(resolved.text);
            lines = parsed.lines;
            meta = parsed.meta;
            timed = parsed.timed;
        } catch {
            // 取词整体失败：来源标注保持 loading 时那份（关联还在，只是拉不到）
            lines = [];
            meta = {};
            timed = false;
        }
        // 取词期间已切歌 → 丢弃这个过期结果
        if (generation !== this.#generation) {
            return;
        }
        this.#lines = lines;
        this.#metaOffset = meta.offset ?? 0;
        this.#userOffset = this.#mediaMeta.getLyricOffset(item);
        this.#timed = timed;
        this.#publishOffset();
        this.#status = lines.length > 0 ? 'loaded' : 'unavailable';
        setLyricState({
            status: this.#status,
            lines,
            meta,
            hasTranslation: lines.some(line => line.translation !== undefined),
            timed,
            origin,
        });
        // 有时间轴才用当前位置立刻定位当前行（纯文本无当前行概念）
        if (timed) {
            this.#syncLine(this.#player.getProgress().position);
        }
    }

    /** 当前曲本源无词时，按用户插件顺序从其它歌词源找第一份可靠匹配 */
    async #searchSimilarLyric(
        item: MusicItem,
        generation: number,
    ): Promise<LyricText | null> {
        const query = searchTitleOf(item);
        if (!query) {
            return null;
        }
        const deadline = Date.now() + AUTO_SEARCH_BUDGET_MS;
        const sources = this.#pluginManager
            .getSearchablePlugins('lyric')
            .filter(
                plugin =>
                    plugin.platform !== item.platform &&
                    plugin.supportedMethods.has('getLyric'),
            );
        for (const plugin of sources) {
            if (!this.#canContinueAutoSearch(generation)) {
                return null;
            }
            const searchBudget = Math.min(
                AUTO_SEARCH_STEP_TIMEOUT_MS,
                deadline - Date.now(),
            );
            if (searchBudget <= 0) {
                return null;
            }
            let candidates: MusicItem[];
            try {
                const result = await withTimeout(
                    plugin.methods.search(query, 1, 'lyric'),
                    searchBudget,
                );
                candidates = result.data.slice(0, SIMILAR_CANDIDATES);
            } catch {
                continue;
            }
            if (!this.#canContinueAutoSearch(generation)) {
                return null;
            }
            const match = pickBestLyricMatch(item, candidates);
            if (!match) {
                continue;
            }
            const lyricBudget = Math.min(
                AUTO_SEARCH_STEP_TIMEOUT_MS,
                deadline - Date.now(),
            );
            if (lyricBudget <= 0) {
                return null;
            }
            try {
                const text = await withTimeout(
                    this.#resolvePluginLyric(match),
                    lyricBudget,
                );
                if (text && this.#canContinueAutoSearch(generation)) {
                    return text;
                }
            } catch {
                // 此源取词失败，继续尝试下一个歌词源
            }
        }
        return null;
    }

    #canContinueAutoSearch(generation: number): boolean {
        return (
            generation === this.#generation &&
            (this.#config.get('lyric.autoSearchLyric') ?? false)
        );
    }

    #handleAutoSearchConfigChange = (): void => {
        const current = this.#currentRef;
        if (!current) {
            return;
        }
        const enabled = this.#config.get('lyric.autoSearchLyric') ?? false;
        const shouldReload = enabled
            ? this.#status === 'unavailable'
            : this.#autoSearchGeneration === this.#generation;
        if (shouldReload) {
            this.#refetchIfCurrent(current).catch(() => {});
        }
    };

    /**
     * 按「用户指定 > 插件默认」解析这首歌该用哪份词
     *
     * custom 的文件丢了就当没指定过、回落插件——它没有可展示的来源，顶着「自定义」
     * 却一片空白只会让人困惑；associated 取不到词仍保留来源标注，因为「关联到哪首歌」
     * 这件事本身还在，用户需要知道是拉不到而不是没关联
     */
    async #resolveLyric(
        item: MusicItem,
        override: LyricOverride | undefined,
    ): Promise<EffectiveLyric> {
        if (override?.kind === 'custom') {
            const text = await readCustomLyric(item);
            if (text) {
                return { text, origin: { kind: 'custom' } };
            }
        } else if (override?.kind === 'associated') {
            return {
                text: await this.#resolvePluginLyric(override.musicItem),
                origin: { kind: 'associated', musicItem: override.musicItem },
            };
        }
        return {
            text: await this.#resolvePluginLyric(item),
            origin: PLUGIN_ORIGIN,
        };
    }

    /** 归一并解析一份歌词来源（关联记录或插件结果）；来源是不可信输入，非字符串字段强制归一避免 parser 崩 */
    #parseSource(
        source: { rawLrc?: string; translation?: string } | null | undefined,
    ) {
        const rawLrc = typeof source?.rawLrc === 'string' ? source.rawLrc : '';
        const translation =
            typeof source?.translation === 'string'
                ? source.translation
                : undefined;
        return parseLyric(rawLrc, { translation });
    }

    /**
     * 取某首歌的插件词，经文件缓存；命中即不联网
     *
     * 负缓存**只在**「插件成功返回、但解析不出可显示的行」时记。以下三种一律不记：
     * 插件不存在、插件不支持取词（装回或换个插件就有了）、getLyric 抛错（网络抖动是暂时的）
     * 记错任何一种，都会把「此刻拿不到」变成「一整天都没有」
     */
    async #resolvePluginLyric(item: MusicItem): Promise<LyricText | null> {
        const cached = await readCachedLyric(item);
        if (cached.kind === 'hit') {
            return cached.text;
        }
        if (cached.kind === 'none') {
            return null;
        }
        const plugin = this.#pluginManager.getByMediaItem(item);
        // 插件不在或不支持取词：这不是「这首没词」，不记负缓存
        // （也避免为此懒编译整个插件）
        if (!plugin?.supportedMethods.has('getLyric')) {
            return null;
        }
        let raw: RawLyric | null;
        try {
            raw = await plugin.methods.getLyric(item);
        } catch {
            // 网络失败 / 插件出错：暂时性的，不记负缓存
            return null;
        }
        const text = toStoredText(raw);
        if (!text) {
            await writeCachedMiss(item);
            return null;
        }
        // 写缓存失败不能连累这次取词——词已经拿到了，落不了盘只是下次再请求一遍
        await writeCachedLyric(item, text).catch(() => undefined);
        return text;
    }

    #handleProgress = (progress: Progress): void => {
        this.#syncLine(progress.position);
    };

    /** 按播放位置定位当前行，先扣除有效偏移；仅在行号变化时发布，纯文本歌词不同步 */
    #syncLine(position: number): void {
        if (!this.#timed || this.#lines.length === 0) {
            return;
        }
        const active = findActiveLine(
            this.#lines,
            position - (this.#metaOffset - this.#userOffset),
            this.#currentLineIndex,
        );
        if (active.index !== this.#currentLineIndex) {
            this.#currentLineIndex = active.index;
            setCurrentLine(active);
        }
    }

    previewLyricOffset(seconds: number): void {
        this.#applyOffset(seconds);
    }

    commitLyricOffset(seconds: number): void {
        if (!this.#currentRef) {
            return;
        }
        this.#mediaMeta.setLyricOffset(this.#currentRef, seconds);
        this.#applyOffset(seconds);
    }

    resetLyricOffset(): void {
        this.commitLyricOffset(0);
    }

    async associateLyric(
        target: MusicItem,
        source: MusicItem,
    ): Promise<boolean> {
        // 不允许关联到自身（同 platform+id）：等同默认取词、只会钉快照污染已关联态
        if (isSameMediaRef(target, source)) {
            return false;
        }
        try {
            // 取选中项所属插件的权威完整歌词（含翻译）；经缓存，故预览时取过就不再请求
            // 解析不出可显示行时返回 null，即视为无效关联（避免误报成功后画布空白）
            const text = await this.#resolvePluginLyric(source);
            if (!text) {
                return false;
            }
            // 落库到 target 名下；不可信 DTO 序列化失败时 setLyricOverride 返 false
            if (
                !this.#mediaMeta.setLyricOverride(target, {
                    kind: 'associated',
                    musicItem: source,
                })
            ) {
                return false;
            }
        } catch {
            return false;
        }
        // 关联覆盖掉可能存在的自定义词：两种来源互斥，留着文件就是取不到的孤儿
        // 与重取并发：重取的失效动作必须同步发生，不能等在删文件之后，
        // 否则间隙里的进度事件仍会按旧时间轴发布当前行
        const removal = deleteCustomLyric(target);
        // 关联的正是当前播放歌 → 立即重取重渲染（#loadCurrentLyric 会先读到刚写的关联词）；非当前歌只持久化
        await Promise.all([this.#refetchIfCurrent(target), removal]);
        return true;
    }

    async resetLyric(target: MusicItem): Promise<void> {
        this.#mediaMeta.clearLyricOverride(target);
        // 关联与手工编辑一并清；文件删不掉也无碍，没有来源指向它，读不到就是读不到
        // 与重取并发：标记已清，取词不会再读到这个文件；且重取的失效动作必须同步发生，
        // 不能等在删文件之后，否则间隙里的进度事件仍会按旧时间轴发布当前行
        const removal = deleteCustomLyric(target);
        // 恢复的正是当前播放歌 → 立即重取重渲染（回落插件默认词）；非当前歌只清除
        await Promise.all([this.#refetchIfCurrent(target), removal]);
    }

    getEffectiveLyric(target: MusicItem): Promise<EffectiveLyric> {
        return this.#resolveLyric(
            target,
            this.#mediaMeta.getLyricOverride(target),
        );
    }

    async setCustomLyric(
        target: MusicItem,
        text: LyricText | null,
    ): Promise<void> {
        // 保存前削掉尾部空白：用户粘贴常带一串空行，留着只是白占长度上限
        // 只削尾不削头——行首缩进可能是用户有意排版的
        const rawLrc = (text?.rawLrc ?? '').trimEnd();
        // 正文空白 = 用户要的就是「不再用我编的这份」，与恢复默认歌词同义
        if (!rawLrc) {
            await this.resetLyric(target);
            return;
        }
        const translation = (text?.translation ?? '').trimEnd();
        // UI 已按同一上限拦过，这里是持久化前的兜底；截断必须代理对安全，否则会存出半个 emoji
        await writeCustomLyric(target, {
            rawLrc: clampToMaxLength(rawLrc, LYRIC_MAX_LENGTH),
            ...(translation
                ? {
                      translation: clampToMaxLength(
                          translation,
                          LYRIC_MAX_LENGTH,
                      ),
                  }
                : {}),
        });
        // 先文件后标记：中断则文件是无人指向的孤儿，等同于没编辑过；反过来会指向不存在的文件
        // 标记写不进去就得报错——否则页面报了保存成功，实际仍在用旧来源。
        // 此时不删刚写的文件：若本就是自定义词的覆盖保存，旧标记仍指向它、内容其实是对的
        if (!this.#mediaMeta.setLyricOverride(target, { kind: 'custom' })) {
            throw new Error('failed to persist custom lyric marker');
        }
        await this.#refetchIfCurrent(target);
    }

    /**
     * target 是当前播放歌时重取重渲染（关联/解除后调用、读回最新关联态）；非当前歌不动
     * 重取用 player 当前对象（#currentRef）而非调用方传入的 target 快照（后者可能是列表旧快照，字段更薄）；
     * 进入 loading 前先失效旧时间轴（#lines/#timed），避免异步取词间隙进度事件残留旧当前行
     */
    async #refetchIfCurrent(target: MusicItem): Promise<void> {
        const current = this.#currentRef;
        if (!current || !isSameMediaRef(target, current)) {
            return;
        }
        this.#lines = [];
        this.#timed = false;
        this.#generation += 1;
        this.#currentLineIndex = -1;
        setCurrentLine(NO_ACTIVE_LINE);
        // loading 态由 #loadCurrentLyric 同步发布（它要先读覆盖标记才知道来源）
        await this.#loadCurrentLyric(current, this.#generation).catch(() => {});
    }

    subscribeLyricContent(cb: (content: LyricContent) => void): () => void {
        return subscribeContent(cb);
    }

    /** 将用户偏移应用到内存状态：更新字段、发布偏移，并按新偏移重定位当前行；不持久化 */
    #applyOffset(seconds: number): void {
        if (
            !this.#currentRef ||
            !Number.isFinite(seconds) ||
            seconds === this.#userOffset
        ) {
            return;
        }
        this.#userOffset = seconds;
        this.#publishOffset();
        this.#syncLine(this.#player.getProgress().position);
    }

    /** 将有效偏移（#metaOffset − #userOffset）和用户偏移发布到 offset atom */
    #publishOffset(): void {
        publishLyricOffset({
            effective: this.#metaOffset - this.#userOffset,
            user: this.#userOffset,
        });
    }
}

/** 裸对象 live-binding：供 UX / core 读，由 app/container 装配 */
export let lyric: ILyric;

/** 仅供 app/container 调用：装配 lyric 单例 */
export function provideLyric(instance: ILyric): void {
    lyric = instance;
}

export { useCurrentLyricLine, useLyric, useLyricOffset } from './hooks';
export { parseLyric } from './parser';
export type {
    ActiveLine,
    EffectiveLyric,
    ILyric,
    LyricContent,
    LyricDeps,
    LyricMeta,
    LyricOffset,
    LyricOrigin,
    LyricState,
    LyricStatus,
    LyricText,
} from './types';
