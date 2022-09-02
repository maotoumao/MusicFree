import {Plugin, pluginManager} from '@/common/pluginManager';
import produce from 'immer';
import {useAtom, useSetAtom} from 'jotai';
import {useCallback, useRef} from 'react';
import {
  PageStatus,
  pageStatusAtom,
  searchResultsAtom,
  SearchStateCode,
} from '../store/atoms';

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
        const tgtPlugin = pluginManager.getPluginByHash(pluginHash);
        tgtPlugin && (plugins = [tgtPlugin]);
      } else {
        plugins = pluginManager.getValidPlugins();
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

        const searchType = type ?? plugin.instance.defaultSearchType ?? 'music';
        // 上一份搜索结果
        const prevPluginResult = searchResults[searchType][plugin.hash];
        /** 上一份搜索还没返回/已经结束 */
        if (
          (prevPluginResult?.state === SearchStateCode.PENDING ||
            prevPluginResult?.state === SearchStateCode.FINISHED) &&
          undefined === query
        ) {
          return;
        }

        // 是否是一次新的搜索
        const newSearch =
          query || prevPluginResult?.page === undefined || queryPage === 1;

        // 本次搜索关键词
        currentQueryRef.current = query =
          query ?? prevPluginResult?.query ?? '';

        /** 搜索的页码 */
        const page =
          queryPage ?? newSearch ? 1 : (prevPluginResult?.page ?? 0) + 1;

        try {
          setSearchResults(
            produce(draft => {
              const prevMediaResult: any = draft[searchType];
              prevMediaResult[_hash] = {
                state: newSearch
                  ? SearchStateCode.PENDING_FP
                  : SearchStateCode.PENDING,
                // @ts-ignore
                data: newSearch ? [] : prevMediaResult[_hash]?.data ?? [],
                query: query,
                page,
              };
              return draft;
            }),
          );
          // !! jscore的promise有问题，改成hermes就好了，可能和JIT有关，不知道。
          const result = await plugin?.instance?.search?.(
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
            throw new Error();
          }
          setSearchResults(
            produce(draft => {
              const prevMediaResult = draft[searchType];
              const prevPluginResult: any = prevMediaResult[_hash] ?? {
                data: [],
              };
              const tagedResult = makeTag(result.data ?? [], _platform);

              prevMediaResult[_hash] = {
                state:
                  (result?.isEnd === false && result?.data?.length)
                    ? SearchStateCode.PARTLY_DONE
                    : SearchStateCode.FINISHED,
                query,
                page,
                data: newSearch
                  ? tagedResult
                  : (prevPluginResult.data ?? []).concat(tagedResult),
              };
              return draft;
            }),
          );
        } catch (e) {
          console.log('SEARCH ERROR', e);
          setPageStatus(PageStatus.RESULT);
          setSearchResults(
            produce(draft => {
              const prevMediaResult = draft[searchType];
              const prevPluginResult = prevMediaResult[_hash] ?? {data: []};

              prevPluginResult.state = SearchStateCode.PARTLY_DONE;
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

function makeTag<X extends Record<string, any>[] = any[]>(
  objArray: X,
  tag: string,
): X {
  objArray.forEach(_ => {
    _.platform = tag;
  });
  return objArray;
}
