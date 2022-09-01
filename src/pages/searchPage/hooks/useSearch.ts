import {pluginManager, usePlugins} from '@/common/pluginManager';
import produce from 'immer';
import {useAtom, useSetAtom} from 'jotai';
import {useCallback, useRef} from 'react';
import {PageStatus, pageStatusAtom, searchResultsAtom, SearchStateCode} from '../store/atoms';

export default function useSearch() {
  const setPageStatus = useSetAtom(pageStatusAtom);
  const [searchResults, setSearchResults] = useAtom(searchResultsAtom);

  // 当前正在搜索
  const currentQueryRef = useRef<string>('');

  const search = useCallback(
    async function (
      query?: string,
      platformHash = 'all',
      queryPage = undefined,
    ) {
      const installedPlugins = pluginManager.getValidPlugins();
      const plugins =
        platformHash === 'all'
          ? installedPlugins
          : [installedPlugins.find(_ => _.hash === platformHash)];
      // 使用选中插件搜素
      plugins.forEach(async plugin => {
        const _platform = plugin?.instance.platform;
        const _hash = plugin?.hash;
        if (!plugin || !_platform || !_hash) {
          // 没有插件，此时直接进入结果页
          setPageStatus(PageStatus.RESULT);
          return;
        }
        const _prevResult = searchResults[_hash] ?? {};
        if (
          (_prevResult.state === SearchStateCode.PENDING || _prevResult.state === SearchStateCode.FINISHED) &&
          undefined === query
        ) {
          return;
        }

        // 是否是一次新的搜索
        const newSearch =
          query || _prevResult?.currentPage === undefined || queryPage === 1;

        // 搜索关键词
        currentQueryRef.current = query = query ?? _prevResult?.query ?? '';

        /** 搜索的页码 */
        const page =
          queryPage ?? newSearch ? 1 : (_prevResult.currentPage ?? 0) + 1;

        try {
          setSearchResults(
            produce(draft => {
              const prev = draft[_hash] ?? {};
              draft[_hash] = {
                state: SearchStateCode.PENDING,
                result: newSearch ? {} : prev.result,
                query: query,
                currentPage: page,
              };
              return draft;
            }),
          );
          // !! jscore的promise有问题，改成hermes就好了，可能和JIT有关，不知道。
          const result = await plugin?.instance?.search?.(query, page);
          console.log('RESULT', result);
          if (currentQueryRef.current !== query) {
            return;
          }
          setPageStatus(PageStatus.RESULT);
          if (!result) {
            throw new Error();
          }
          setSearchResults(
            produce(draft => {
              const prev = draft[_hash] ?? {};
              if (result._isEnd === false) {
                prev.state = SearchStateCode.PARTLY_DONE;
              } else {
                prev.state = SearchStateCode.FINISHED;
              }
              prev.result = newSearch
                ? mergeResult(result, {}, _platform)
                : mergeResult(prev.result ?? {}, result ?? {}, _platform);
              draft[_hash] = {
                state: prev.state,
                result: prev.result,
                query: query,
                currentPage: page,
              };
              return draft;
            }),
          );
        } catch (e) {
          console.log('SEARCH ERROR', e);
          setSearchResults(
            produce(draft => {
              const prev = draft[_hash] ?? {};
              prev.state = SearchStateCode.PARTLY_DONE;
              draft[_hash] = prev;
            }),
          );
        }
      });
    },
    [searchResults],
  );

  return search;
}

// todo: 去重
const resultKeys: (keyof IPlugin.ISearchResult)[] = ['album', 'music', 'artist'];
function mergeResult(
  obj1: Record<string, any>,
  obj2: Record<string, any>,
  platform: string,
): IPlugin.ISearchResult {
  const result: Record<string, any> = {};
  for (let k of resultKeys) {
    result[k] = (obj1[k] ?? [])
      .map((_: any) =>
        produce(_, (_: any) => {
          _.platform = platform;
        }),
      )
      .concat(
        (obj2[k] ?? []).map((_: any) =>
          produce(_, (_: any) => {
            _.platform = platform;
          }),
        ),
      );
  }
  return result;
}
