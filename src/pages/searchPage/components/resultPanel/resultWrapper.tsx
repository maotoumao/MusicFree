import React, {useEffect, useState} from 'react';
import {useAtomValue} from 'jotai';
import {searchResultsAtom} from '../../store/atoms';
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
  const [pendingState, setPendingState] = useState<string>('pending');
  const data = getMediaItems(searchResults, pluginHash, tab);
  const ResultComponent = renderMap[tab]!;

  useEffect(() => {
    setPendingState(
      pluginHash === 'all'
        ? Object.values(searchResults).every(_ => _.state !== 'pending')
          ? 'resolved'
          : 'pending'
        : searchResults[pluginHash]?.state ?? 'pending',
    );
  }, [searchResults]);

  return (!data || !data?.length) && pendingState === 'pending' ? (
    <Loading></Loading>
  ) : (
    <FlatList
      data={data ?? []}
      contentContainerStyle={{flex: 1}}
      onEndReached={() => {
        pendingState === 'resolved' && search(undefined, pluginHash);
      }}
      renderItem={({item, index}) => (
        <ResultComponent item={item} index={index}></ResultComponent>
      )}></FlatList>
  );
}
