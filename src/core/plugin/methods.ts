/**
 * 方法调用归口：PluginImpl 与 localPlugin 共用的类型化门面
 * 单方法 = ensureLoaded() → 取 definition 方法（无则回退 deprecated 旧名）→ normalizeArgs → 调用 → normalizeResult / defaultResult
 * 只做规范化；缓存·重试·mediaMeta·本地歌词包在归口外（core/player·lyric·mediaMeta）
 */
import {
    deprecatedMethodFallbacks,
    methodNormalizers,
    type MethodNormalizer,
} from './normalizer';

import type { PluginMethods } from './types';
import type { PluginDefinition } from '@/types';

/** 归口运行期上下文（PluginImpl / localPlugin 各自装配） */
export interface MethodContext {
    /** owning 插件身份（结果 platform 盖章用） */
    platform: string;
    /** 插件声明的搜索类型（search 出站 sheet↔playlist wire 用） */
    supportedSearchTypes?: readonly string[];
    /** 取已编译 definition（未编译返 undefined） */
    getDefinition(): PluginDefinition | undefined;
    /** 触发懒编译（幂等） */
    ensureLoaded(): Promise<void>;
}

type PluginFn = (...args: unknown[]) => unknown;

/** 解析实际调用的插件函数：优先规范名，缺失则回退 deprecated 旧名 */
function resolveFn(
    def: PluginDefinition | undefined,
    method: keyof PluginMethods,
): PluginFn | undefined {
    const record = def as Record<string, unknown> | undefined;
    const direct = record?.[method];
    if (typeof direct === 'function') {
        return direct as PluginFn;
    }
    const fallback = (
        deprecatedMethodFallbacks as Partial<Record<string, string>>
    )[method];
    const deprecated = fallback ? record?.[fallback] : undefined;
    return typeof deprecated === 'function'
        ? (deprecated as PluginFn)
        : undefined;
}

/** 归口单次调用：懒编译 → 解析函数 → 出站整形 → 调用 → 入站整形 / 兜底 */
async function callPluginMethod<R>(
    ctx: MethodContext,
    method: keyof PluginMethods,
    args: unknown[],
): Promise<R> {
    await ctx.ensureLoaded();
    const def = ctx.getDefinition();
    // 运行时 method 是 union key，索引得到强类型 union——擦除为消费视图后统一 dispatch
    const spec = methodNormalizers[method] as MethodNormalizer;
    const fn = resolveFn(def, method);
    if (!fn) {
        return spec.defaultResult() as R;
    }
    const finalArgs =
        spec.normalizeArgs?.(args, {
            supportedSearchTypes: ctx.supportedSearchTypes,
        }) ?? args;
    if (__DEV__) {
        console.warn(
            '[plugin] calling method:',
            ctx.platform,
            method,
            'with args:',
            finalArgs,
        );
    }
    const raw = (await fn.apply(def, finalArgs)) ?? spec.defaultResult();
    return (
        spec.normalizeResult ? spec.normalizeResult(raw, ctx.platform) : raw
    ) as R;
}

/** 装配类型化方法门面：外部调用点拿到 PluginMethods 的完整类型，归口内部统一走 callPluginMethod */
export function buildMethods(ctx: MethodContext): PluginMethods {
    return {
        search: (query, page, type) =>
            callPluginMethod(ctx, 'search', [query, page, type]),
        getMediaSource: (item, quality) =>
            callPluginMethod(ctx, 'getMediaSource', [item, quality]),
        getMusicInfo: item => callPluginMethod(ctx, 'getMusicInfo', [item]),
        getLyric: item => callPluginMethod(ctx, 'getLyric', [item]),
        getAlbumInfo: (item, page) =>
            callPluginMethod(ctx, 'getAlbumInfo', [item, page]),
        getArtistWorks: (item, page, type) =>
            callPluginMethod(ctx, 'getArtistWorks', [item, page, type]),
        getPlaylistInfo: (item, page) =>
            callPluginMethod(ctx, 'getPlaylistInfo', [item, page]),
        getTopLists: () => callPluginMethod(ctx, 'getTopLists', []),
        getTopListDetail: (item, page) =>
            callPluginMethod(ctx, 'getTopListDetail', [item, page]),
        getRecommendPlaylistTags: () =>
            callPluginMethod(ctx, 'getRecommendPlaylistTags', []),
        getRecommendPlaylistsByTag: (tag, page) =>
            callPluginMethod(ctx, 'getRecommendPlaylistsByTag', [tag, page]),
        getMusicComments: (item, page) =>
            callPluginMethod(ctx, 'getMusicComments', [item, page]),
        importMusicItem: urlLike =>
            callPluginMethod(ctx, 'importMusicItem', [urlLike]),
        importPlaylist: urlLike =>
            callPluginMethod(ctx, 'importPlaylist', [urlLike]),
    };
}
