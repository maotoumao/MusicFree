import {pluginManager, usePlugins} from '@/common/pluginManager';
import produce from 'immer';
import {useAtom, useSetAtom} from 'jotai';
import {useCallback} from 'react';
import {PageStatus, pageStatusAtom, searchResultsAtom} from '../store/atoms';

const mergeData = (
  target: IPlugin.ISearchResult,
  original: IPlugin.ISearchResult,
  key: IPlugin.ISearchResultType,
  platform: string,
) => {
  // @ts-ignore
  target[key] = (target[key] ?? [])?.concat(
    (original[key] ?? [])?.map(_ => {
      _.platform = platform;
      return _;
    }),
  );
  return target;
};

export default function useSearch() {
  const setPageStatus = useSetAtom(pageStatusAtom);
  const [searchResults, setSearchResults] = useAtom(searchResultsAtom);

  const search = useCallback(async function (
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
      const _prevResult = searchResults[_hash];
      if (_prevResult?.pending) {
        return;
      }
      const newSearch =
        query || _prevResult?.currentPage === undefined || queryPage === 1;
      query = query ?? _prevResult?.query ?? '';
      const page =
        queryPage ?? newSearch ? 1 : (_prevResult.currentPage ?? 0) + 1;
      try {
        setSearchResults(
          produce(draft => {
            const prev = draft[_hash] ?? {};
            prev.query = query;
            prev.pending = true;
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
            prev.query = query!;
            prev.currentPage = page;
            prev.pending = false;
            prev.result = newSearch
              ? [result]
              : [...(prev?.result ?? []), result];
            draft[_hash] = prev;
          }),
        );
        // plugin?.instance
        //   ?.search?.(query, page)
        //   ?.then(result => {
        //     // 任何一个加载出来就可以出现结果页了
        //     setPageStatus(PageStatus.RESULT);
        //     if (!result) {
        //       throw new Error();
        //     }
        //     setSearchResults(
        //       produce(draft => {
        //         const prev = draft[_platform] ?? {};
        //         prev.query = query!;
        //         prev.currentPage = page;
        //         prev.pending = false;
        //         prev.result = newSearch
        //           ? [result]
        //           : [...(prev?.result ?? []), result];
        //         draft[_platform] = prev;
        //       }),
        //     );
        //   })
        //   ?.catch(() => {
        //     setSearchResults(
        //       produce(draft => {
        //         const prev = draft[_platform] ?? {};
        //         prev.pending = false;
        //         draft[_platform] = prev;
        //       }),
        //     );
        //   });
      } catch(e) {
        console.log('SEARCH ERROR', e);
        setSearchResults(
          produce(draft => {
            const prev = draft[_hash] ?? {};
            prev.pending = false;
            draft[_hash] = prev;
          }),
        );
      }
    });
  },
  []);

  return search;
}

// export default function useSearch() {
//   const setSearchResult = useSetAtom(searchResultAtom);
//   const setPageStatus = useSetAtom(pageStatusAtom);

//   async function search(query: string, page: number) {
//     const plugins = pluginManager.getPlugins();
//     console.log('1', Date.now());
//     const _rawResults = await allSettled(
//       // @ts-ignore
//       plugins.map(plugin =>
//         plugin.instance?.search?.(query, page)?.then(res => {
//           console.log('1.1', Date.now());
//           return res;
//         }),
//       ),
//     );
//     console.log('2', Date.now());
//     for (let i = 0; i < plugins.length; ++i) {
//       const _rr = _rawResults[i];
//       setSearchResult(prevResult =>
//         produce(page === 1 ? {} : prevResult, draft => {
//           // merge data
//           // @ts-ignore
//           const _result = _rr.status === 'fulfilled' ? _rr.value ?? {} : {};
//           // 合并搜索结果
//           mergeData(draft, _result, 'music', plugins[i].instance.platform);
//           mergeData(draft, _result, 'album', plugins[i].instance.platform);
//         }),
//       );
//     }
//     setPageStatus(PageStatus.RESULT);
//   }
//   return search;
// }
