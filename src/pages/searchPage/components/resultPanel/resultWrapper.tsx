import React, {useEffect, useState} from 'react';
import {useAtomValue} from 'jotai';
import {searchResultsAtom, SearchStateCode} from '../../store/atoms';
import getMediaItems from '../../common/getMediaItems';
import {renderMap} from './results';
import useSearch from '../../hooks/useSearch';
import Loading from '@/components/base/loading';
import {FlatList} from 'react-native';

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
      const code = Object.values(searchResults).reduce(
        (prev, curr) => prev & curr.state,
        7,
      );
      if (code === SearchStateCode.IDLE) {
        setSearchState(SearchStateCode.PENDING);
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
