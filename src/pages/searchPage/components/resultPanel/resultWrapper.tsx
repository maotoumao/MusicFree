import React, {useEffect, useState} from 'react';
import {useAtomValue} from 'jotai';
import {searchResultsAtom} from '../../store/atoms';
import getMediaItems from '../../common/getMediaItems';
import {renderMap} from './results';

interface IResultWrapperProps {
  tab: ICommon.SupportMediaType;
  platform: string;
}
export default function ResultWrapper(props: IResultWrapperProps) {
  const {tab, platform} = props;
  const searchResults = useAtomValue(searchResultsAtom);
  const [pendingState, setPendingState] = useState<string>('pending');
  const data = getMediaItems(searchResults, platform, tab);
  const ResultComponent = renderMap[tab]!;

  useEffect(() => {
    setPendingState(
      platform === 'all'
        ? Object.values(searchResults).every(_ => _.state !== 'pending')
          ? 'resolved'
          : 'pending'
        : searchResults[platform]?.state ?? 'pending',
    );
  }, [searchResults]);
  return (
    <ResultComponent
      platform={platform}
      data={data}
      pendingState={pendingState}></ResultComponent>
  );
}
