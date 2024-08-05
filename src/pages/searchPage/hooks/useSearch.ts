import {devLog, errorLog, trace} from '@/utils/log';
import {RequestStateCode} from '@/constants/commonConst';
import {produce} from 'immer';
import {getDefaultStore, useAtom, useSetAtom} from 'jotai';
import {useCallback, useRef} from 'react';
import {PageStatus, pageStatusAtom, searchResultsAtom} from '../store/atoms';
import PluginManager, {Plugin} from '@/core/pluginManager';

export default function useSearch() {
    const setPageStatus = useSetAtom(pageStatusAtom);
    const [searchResults, setSearchResults] = useAtom(searchResultsAtom);

    // 当前正在搜索
    const currentQueryRef = useRef<string>('');

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
            /** 如果没有指定插件，就用所有插件搜索 */

            let plugins: Plugin[] = [];
            if (pluginHash) {
                const tgtPlugin = PluginManager.getByHash(pluginHash);
                tgtPlugin && (plugins = [tgtPlugin]);
            } else {
                plugins = PluginManager.getSearchablePlugins();
            }
            if (plugins.length === 0) {
                setPageStatus(PageStatus.NO_PLUGIN);
                return;
            }
            // 使用选中插件搜素
            plugins.forEach(async plugin => {
                const _platform = plugin.instance.platform;
                const _hash = plugin.hash;
                if (!_platform || !_hash) {
                    // 插件无效，此时直接进入结果页
                    setPageStatus(PageStatus.RESULT);
                    return;
                }

                const searchType =
                    type ?? plugin.instance.defaultSearchType ?? 'music';
                // 上一份搜索结果
                const prevPluginResult = searchResults[searchType][plugin.hash];
                /** 上一份搜索还没返回/已经结束 */
                if (
                    (prevPluginResult?.state ===
                        RequestStateCode.PENDING_REST_PAGE ||
                        prevPluginResult?.state ===
                            RequestStateCode.FINISHED) &&
                    undefined === query
                ) {
                    return;
                }

                // 是否是一次新的搜索
                const newSearch =
                    query ||
                    prevPluginResult?.page === undefined ||
                    queryPage === 1;

                // 本次搜索关键词
                currentQueryRef.current = query =
                    query ?? prevPluginResult?.query ?? '';

                /** 搜索的页码 */
                const page =
                    queryPage ?? newSearch
                        ? 1
                        : (prevPluginResult?.page ?? 0) + 1;

                trace('开始搜索', {
                    _platform,
                    query,
                    page,
                    searchType,
                });

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
                                query: query,
                                page,
                            };
                        }),
                    );
                    // !! jscore的promise有问题，改成hermes就好了，可能和JIT有关，不知道。
                    const result = await plugin?.methods?.search?.(
                        query,
                        page,
                        searchType,
                    );
                    /** 如果搜索结果不是本次结果 */
                    if (currentQueryRef.current !== query) {
                        return;
                    }
                    /** 切换到结果页 */
                    setPageStatus(PageStatus.RESULT);
                    if (!result) {
                        throw new Error('搜索结果为空');
                    }
                    setSearchResults(
                        produce(draft => {
                            const prevMediaResult = draft[searchType];
                            const prevPluginResult: any = prevMediaResult[
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
                                query,
                                page,
                                data: newSearch
                                    ? currResult
                                    : (prevPluginResult.data ?? []).concat(
                                          currResult,
                                      ),
                            };
                            return draft;
                        }),
                    );
                } catch (e: any) {
                    errorLog('搜索失败', e?.message);
                    devLog(
                        'error',
                        '搜索失败',
                        `Plugin: ${plugin.name} Query: ${query} Page: ${page}`,
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
                            const prevPluginResult = prevMediaResult[_hash] ?? {
                                data: [],
                            };

                            prevPluginResult.state =
                                RequestStateCode.PARTLY_DONE;
                            return draft;
                        }),
                    );
                }
            });
        },
        [searchResults],
    );

    return search;
}
