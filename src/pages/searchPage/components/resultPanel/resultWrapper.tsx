import React, {memo, useEffect, useState} from 'react';
import {useAtomValue} from 'jotai';
import {
  ISearchResult,
  queryAtom,
  searchResultsAtom,
} from '../../store/atoms';
import {renderMap} from './results';
import useSearch from '../../hooks/useSearch';
import Loading from '@/components/base/loading';
import {FlatList, StyleSheet} from 'react-native';
import ThemeText from '@/components/base/themeText';
import { RequestStateCode } from '@/constants/commonConst';

interface IResultWrapperProps<
  T extends ICommon.SupportMediaType = ICommon.SupportMediaType,
> {
  tab: T;
  pluginHash: string;
  pluginName: string;
  searchResult: ISearchResult<T>;
}
function ResultWrapper(props: IResultWrapperProps) {
  const {tab, pluginHash, searchResult, pluginName} = props;
  const search = useSearch();
  const [searchState, setSearchState] = useState<RequestStateCode>(
    searchResult?.state ?? RequestStateCode.IDLE,
  );
  const query = useAtomValue(queryAtom);

  const ResultComponent = renderMap[tab]!;
  const data: any = searchResult?.data ?? [];

  useEffect(() => {
    if (searchState === RequestStateCode.IDLE) {
      search(query, 1, tab, pluginHash);
    }
  }, []);

  useEffect(() => {
    setSearchState(searchResult?.state ?? RequestStateCode.IDLE);
  }, [searchResult]);

  const renderItem = ({item, index}: any) => (
    <ResultComponent item={item} index={index} pluginHash={pluginHash}></ResultComponent>
  );

  return searchState === RequestStateCode.PENDING_FP ? (
    <Loading></Loading>
  ) : (
    <FlatList
      extraData={searchState}
      style={style.list}
      ListEmptyComponent={() => <ThemeText>什么都没有</ThemeText>}
      ListFooterComponent={() => (
        <ThemeText>
          {searchState === RequestStateCode.PENDING
            ? '加载中...'
            : searchState === RequestStateCode.FINISHED
            ? '到底啦'
            : ''}
        </ThemeText>
      )}
      data={data}
      refreshing={false}
      onRefresh={() => {
        search(query, 1, tab, pluginHash);
      }}
      onEndReached={() => {
        (searchState === RequestStateCode.PARTLY_DONE ||
          searchState === RequestStateCode.IDLE) &&
          search(undefined, undefined, tab, pluginHash);
      }}
      renderItem={renderItem}></FlatList>
  );
}
const style = StyleSheet.create({
  list: {
    flex: 1,
  },
});

export default memo(ResultWrapper);
