import {pluginManager, usePlugins} from '@/common/pluginManager';
import produce from 'immer';
import {useAtom, useSetAtom} from 'jotai';
import {useCallback} from 'react';
import {PageStatus, pageStatusAtom, searchResultsAtom} from '../store/atoms';

export default function useSearch() {
  const setPageStatus = useSetAtom(pageStatusAtom);
  const [searchResults, setSearchResults] = useAtom(searchResultsAtom);

  const search = useCallback(
    async function (
      query?: string,
      platformHash = 'all',
      queryPage = undefined,
    ) {
      // 如果没有搜索结果缓存，那就是没有搜过
      const installedPlugins = pluginManager.getValidPlugins();
      const plugins =
        platformHash === 'all'
          ? installedPlugins
          : [installedPlugins.find(_ => _.hash === platformHash)];
      plugins.forEach(async plugin => {
        const _platform = plugin?.instance.platform;
        const _hash = plugin?.hash;
        if (!plugin || !_platform || !_hash) {
          // 没有插件，此时直接进入结果页
          setPageStatus(PageStatus.RESULT);
          return;
        }
        const _prevResult = searchResults[_hash] ?? {};
        if (_prevResult.state === 'pending' || _prevResult.state === 'done') {
          return;
        }

        const newSearch =
          query || _prevResult?.currentPage === undefined || queryPage === 1;
        query = query ?? _prevResult?.query ?? '';
        const page =
          queryPage ?? newSearch ? 1 : (_prevResult.currentPage ?? 0) + 1;

        try {
          setSearchResults(prevState =>
            produce(prevState, draft => {
              const prev = draft[_hash] ?? {};
              prev.query = query;
              prev.state = 'pending';
              draft[_hash] = prev;
            }),
          );
          // !! jscore的promise有问题，改成hermes就好了，可能和JIT有关，不知道。
          const result = await plugin?.instance?.search?.(query, page);
          setPageStatus(PageStatus.RESULT);
          if (!result) {
            throw new Error();
          }
          setSearchResults(
            produce(draft => {
              const prev = draft[_hash] ?? {};
              if (result._isEnd === false) {
                prev.state = 'resolved';
              } else {
                prev.state = 'done';
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
              prev.state = 'resolved';
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
const resultKeys: (keyof IPlugin.ISearchResult)[] = ['album', 'music'];
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
