import React, {useEffect, useState} from 'react';
import {useAtomValue} from 'jotai';
import {searchResultsAtom, SearchStateCode} from '../../store/atoms';
import getMediaItems from '../../common/getMediaItems';
import {renderMap} from './results';
import useSearch from '../../hooks/useSearch';
import Loading from '@/components/base/loading';
import {FlatList, StyleSheet} from 'react-native';
import ThemeText from '@/components/base/themeText';

interface IResultWrapperProps {
  tab: ICommon.SupportMediaType;
  pluginHash: string;
  pluginName: string;
}
export default function ResultWrapper(props: IResultWrapperProps) {
  const {tab, pluginHash} = props;
  const search = useSearch();
  const searchResults = useAtomValue(searchResultsAtom);
  const [searchState, setSearchState] = useState<SearchStateCode>(
    SearchStateCode.PENDING,
  );
  const data = getMediaItems(searchResults, pluginHash, tab);
  const ResultComponent = renderMap[tab]!;

  useEffect(() => {
    if (pluginHash === 'all') {
      const allCode = Object.values(searchResults).map(_ => _.state);

      const code = allCode.reduce((prev, curr) => prev & curr);
      if (
        code === SearchStateCode.IDLE ||
        (!data?.length && allCode.includes(SearchStateCode.PENDING))
      ) {
        setSearchState(SearchStateCode.PENDING);
      } else {
        setSearchState(code);
      }
    } else {
      setSearchState(
        searchResults[pluginHash]?.state ?? SearchStateCode.PENDING,
      );
    }
  }, [searchResults]);

  const renderItem = ({item, index}: any) => (
    <ResultComponent item={item} index={index}></ResultComponent>
  );

  return (!data || !data?.length) && searchState === SearchStateCode.PENDING ? (
    <Loading></Loading>
  ) : (
    <FlatList
    extraData={searchState}
      style={style.list}
      ListFooterComponent={() => <ThemeText>{ searchState === SearchStateCode.PENDING ? '加载中...' : searchState === SearchStateCode.FINISHED ?'到底啦' :''}</ThemeText>}
      data={data ?? []}
      onEndReached={() => {
        // todo 修改
        data.length > 10 &&
          searchState === SearchStateCode.PARTLY_DONE &&
          search(undefined, pluginHash);
      }}
      renderItem={renderItem}></FlatList>
  );
}
const style = StyleSheet.create({
  list: {
    flex: 1,
  },
});
