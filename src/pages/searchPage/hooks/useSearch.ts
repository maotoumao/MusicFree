import { devLog, errorLog, trace } from "@/utils/log";
import { RequestStateCode } from "@/constants/commonConst";
import { produce } from "immer";
import { getDefaultStore, useSetAtom } from "jotai";
import { useCallback } from "react";
import {
    ALL_SOURCES_HASH,
    aggregateSearchResultsAtom,
    ISearchResult,
    PageStatus,
    pageStatusAtom,
    searchResultsAtom,
} from "../store/atoms";
import PluginManager, { Plugin } from "@/core/pluginManager";
import { scheduleMusicSearch } from "@/core/aggregateSearch/requestQueue";
import { searchAggregateMusic } from "../store/aggregateMusic";
import { selectedSources } from "@/core/aggregateSearch/service";

export default function useSearch() {
    const setPageStatus = useSetAtom(pageStatusAtom);
    const setSearchResults = useSetAtom(searchResultsAtom);

    /**
     * query: 搜索词
     * queryPage: 搜索页码
     * type: 搜索类型
     * pluginHash: 搜索条件
     */
    const search = useCallback(
        async function (
            query?: string,
            queryPage?: number,
            type?: ICommon.SupportMediaType,
            pluginHash?: string,
        ) {
            if ((type ?? "music") === "music" &&
                (!pluginHash || pluginHash === ALL_SOURCES_HASH)) {
                const expanded = query === undefined && getDefaultStore().get(aggregateSearchResultsAtom).music?.expanded;
                const plugins = [...await selectedSources("preferred"), ...(expanded ? await selectedSources("backup") : [])];
                if (!plugins.length) {
                    setPageStatus(
                        PluginManager.getSearchablePlugins().length
                            ? PageStatus.RESULT
                            : PageStatus.NO_PLUGIN,
                    );
                    if (!PluginManager.getSearchablePlugins().length) return;
                }
                await searchAggregateMusic(plugins, query, queryPage);
                return;
            }
            let plugins: Plugin[] = [];
            if (pluginHash) {
                const selectedPlugin = PluginManager.getByHash(pluginHash);
                if (selectedPlugin) plugins = [selectedPlugin];
            } else {
                plugins = PluginManager.getSearchablePlugins(type);
            }
            if (plugins.length === 0) {
                setPageStatus(PageStatus.NO_PLUGIN);
                return;
            }
            // 使用选中插件搜素
            await Promise.all(plugins.map(async plugin => {
                const _platform = plugin.instance.platform;
                const _hash = plugin.hash;
                if (!_platform || !_hash) {
                    // 插件无效，此时直接进入结果页
                    setPageStatus(PageStatus.RESULT);
                    return;
                }

                const searchType =
                    type ?? plugin.instance.defaultSearchType ?? "music";
                // 上一份搜索结果
                const store = getDefaultStore();
                const prevPluginResult = store.get(searchResultsAtom)[searchType][_hash];
                /** 上一份搜索还没返回/已经结束 */
                if (
                    (prevPluginResult?.state === RequestStateCode.PENDING_FIRST_PAGE ||
                        prevPluginResult?.state ===
                        RequestStateCode.PENDING_REST_PAGE ||
                        prevPluginResult?.state ===
                        RequestStateCode.FINISHED) &&
                    undefined === query
                ) {
                    return;
                }

                // 是否是一次新的搜索
                const newSearch =
                    (query !== undefined && query !== prevPluginResult?.query) ||
                    prevPluginResult?.page === undefined ||
                    queryPage === 1;

                // 本次搜索关键词
                const searchQuery = query ?? prevPluginResult?.query ?? "";

                /** 搜索的页码 */
                const nextPage = prevPluginResult?.state === RequestStateCode.ERROR
                    ? prevPluginResult.page ?? 1
                    : (prevPluginResult?.page ?? 0) + 1;
                const page =
                    queryPage ?? (newSearch ? 1 : nextPage);

                trace("开始搜索", {
                    _platform,
                    query: searchQuery,
                    page,
                    searchType,
                });

                let pendingResult: ISearchResult<typeof searchType> | undefined;
                // Object identity distinguishes same-query refreshes and works across
                // hook instances. Clearing the atom invalidates both success and error.
                const isCurrent = () =>
                    store.get(searchResultsAtom)[searchType][_hash] === pendingResult;
                try {
                    setSearchResults(
                        produce(draft => {
                            const prevMediaResult: any = draft[searchType];
                            prevMediaResult[_hash] = {
                                state: newSearch
                                    ? RequestStateCode.PENDING_FIRST_PAGE
                                    : RequestStateCode.PENDING_REST_PAGE,
                                // @ts-ignore
                                data: newSearch
                                    ? []
                                    : prevMediaResult[_hash]?.data ?? [],
                                query: searchQuery,
                                page,
                            };
                        }),
                    );
                    pendingResult = store.get(searchResultsAtom)[searchType][_hash];
                    // !! jscore的promise有问题，改成hermes就好了，可能和JIT有关，不知道。
                    const result = searchType === "music"
                        ? await scheduleMusicSearch(
                            () => plugin.methods.search(searchQuery, page, searchType),
                            isCurrent,
                        )
                        : await plugin.methods.search(searchQuery, page, searchType);
                    /** 如果搜索结果不是本次结果 */
                    if (!isCurrent()) {
                        return;
                    }
                    /** 切换到结果页 */
                    const currentPageStatus =
                        getDefaultStore().get(pageStatusAtom);
                    if (currentPageStatus !== PageStatus.EDITING) {
                        setPageStatus(PageStatus.RESULT);
                    }
                    if (!result) {
                        throw new Error("搜索结果为空");
                    }
                    setSearchResults(
                        produce(draft => {
                            const prevMediaResult = draft[searchType];
                            const currentPluginResult: any = prevMediaResult[
                                _hash
                            ] ?? {
                                data: [],
                            };
                            const currResult = result.data ?? [];

                            prevMediaResult[_hash] = {
                                state:
                                    result?.isEnd === false &&
                                        result?.data?.length
                                        ? RequestStateCode.PARTLY_DONE
                                        : RequestStateCode.FINISHED,
                                query: searchQuery,
                                page,
                                data: newSearch
                                    ? currResult
                                    : (currentPluginResult.data ?? []).concat(
                                        currResult,
                                    ),
                            };
                            return draft;
                        }),
                    );
                } catch (e: any) {
                    if (!isCurrent()) return;
                    errorLog("搜索失败", e?.message);
                    devLog(
                        "error",
                        "搜索失败",
                        `Plugin: ${plugin.name} Query: ${searchQuery} Page: ${page}`,
                        e,
                        e?.message,
                    );
                    const currentPageStatus =
                        getDefaultStore().get(pageStatusAtom);
                    if (currentPageStatus !== PageStatus.EDITING) {
                        setPageStatus(PageStatus.RESULT);
                    }
                    setSearchResults(
                        produce(draft => {
                            const prevMediaResult = draft[searchType];
                            prevMediaResult[_hash].state =
                                RequestStateCode.ERROR;
                            return draft;
                        }),
                    );
                }
            }));
        },
        [setPageStatus, setSearchResults],
    );

    return search;
}
