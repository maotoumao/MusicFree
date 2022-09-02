import React, {useEffect, useState} from 'react';
import {useAtomValue} from 'jotai';
import {queryAtom, searchResultsAtom, SearchStateCode} from '../../store/atoms';
import {renderMap} from './results';
import useSearch from '../../hooks/useSearch';
import Loading from '@/components/base/loading';
import {FlatList, StyleSheet} from 'react-native';
import ThemeText from '@/components/base/themeText';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';

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
    searchResults[tab][pluginHash]?.state ?? SearchStateCode.IDLE,
  );
  const ResultComponent = renderMap[tab]!;
  const data: any = searchResults[tab][pluginHash]?.data ?? [];
  const query = useAtomValue(queryAtom);
  console.log('RERENDER', tab, pluginHash);

  useEffect(() => {
    setSearchState(
      searchResults[tab][pluginHash]?.state ?? SearchStateCode.IDLE,
    );
  }, [searchResults]);


  const renderItem = ({item, index}: any) => (
    <ResultComponent item={item} index={index}></ResultComponent>
  );

  return searchState === SearchStateCode.PENDING_FP ? (
    <Loading></Loading>
  ) : (
    <FlatList
      extraData={searchState}
      style={style.list}
      ListFooterComponent={() => (
        <ThemeText>
          {searchState === SearchStateCode.PENDING
            ? '加载中...'
            : searchState === SearchStateCode.FINISHED
            ? '到底啦'
            : ''}
        </ThemeText>
      )}
      data={data}
      onEndReached={() => {
        (searchState === SearchStateCode.PARTLY_DONE ||
          searchState === SearchStateCode.IDLE) &&
          search(undefined, undefined, tab, pluginHash);
      }}
      renderItem={renderItem}></FlatList>
  );
}
const style = StyleSheet.create({
  list: {
    flex: 1
  },
});
