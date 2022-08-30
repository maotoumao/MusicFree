import React, {useEffect, useState} from 'react';
import {useAtomValue} from 'jotai';
import {searchResultsAtom} from '../../store/atoms';
import getMediaItems from '../../common/getMediaItems';
import {renderMap} from './results';

interface IResultWrapperProps {
  tab: ICommon.SupportMediaType;
  pluginHash: string;
  pluginName: string
}
export default function ResultWrapper(props: IResultWrapperProps) {
  const {tab, pluginHash} = props;
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
  return (
    <ResultComponent
      platform={pluginHash}
      data={data}
      pendingState={pendingState}></ResultComponent>
  );
}
