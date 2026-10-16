import type { Plugin } from "@/core/pluginManager";
import { scheduleMusicSearch, RequestPriority } from "./requestQueue";
import { SearchConfig, withTimeout } from "./config";

const caches = new WeakMap<Plugin, Map<string, { at: number; result: any }>>();

export interface SourceSearchPage<T extends ICommon.SupportMediaType> {
    plugin: Plugin;
    result?: IPlugin.ISearchResult<T>;
}

/** Fixed-size batches cap active plugin requests at four and retain plugin order. */
export async function searchSourcePage<T extends ICommon.SupportMediaType>(
    plugins: Plugin[],
    query: string,
    page: number,
    type: T,
    isCurrent?: () => boolean,
    priority: RequestPriority = 1,
): Promise<SourceSearchPage<T>[]> {
    const pages: SourceSearchPage<T>[] = [];
    for (let index = 0; index < plugins.length; index += SearchConfig.concurrency) {
        if (isCurrent && !isCurrent()) break;
        const batch = await Promise.all(
            plugins.slice(index, index + SearchConfig.concurrency).map(async plugin => {
                const key = JSON.stringify([plugin.hash, query.normalize("NFKC").trim().toLowerCase(), page, type]);
                const started = Date.now();
                const cache = caches.get(plugin) ?? new Map();
                caches.set(plugin, cache);
                try {
                    const hit = cache.get(key);
                    if (hit && Date.now() - hit.at < SearchConfig.searchCacheMs) return { plugin, result: hit.result };
                    // Keep the queue slot until the real plugin settles. A timeout
                    // abandons the caller, not the underlying uncancellable promise.
                    const request = withTimeout(scheduleMusicSearch(
                        () => plugin.methods.search(query, page, type),
                        () => (isCurrent?.() ?? true) && Date.now() - started < SearchConfig.sourceTimeoutMs, priority,
                    ), SearchConfig.sourceTimeoutMs).then(result => {
                        if (result && Array.isArray(result.data)) {
                            cache.set(key, { at: Date.now(), result });
                            if (cache.size > 300) cache.delete(cache.keys().next().value!);
                        }
                        return result;
                    });
                    const result = await request;
                    if (__DEV__) console.debug("aggregate-source", plugin.hash, Date.now() - started, result?.data?.length ?? 0);
                    return {
                        plugin,
                        result,
                    };
                } catch {
                    if (__DEV__) console.debug("aggregate-source-failed", plugin.hash, Date.now() - started);
                    // The plugin wrapper has already recorded the failed search.
                    return { plugin };
                }
            }),
        );
        pages.push(...batch);
    }
    return pages;
}
