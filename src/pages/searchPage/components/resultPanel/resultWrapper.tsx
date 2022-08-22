import React from 'react';
import {useAtomValue} from 'jotai';
import {searchResultsAtom} from '../../store/atoms';
import getMediaItems from '../../common/getMediaItems';
import { renderMap } from './results';

interface IResultWrapperProps {
  tab: ICommon.SupportMediaType;
  platform: string;
}
export default function ResultWrapper(props: IResultWrapperProps) {
  const {tab, platform} = props;
  const searchResults = useAtomValue(searchResultsAtom);

  const data = getMediaItems<IPlugin.ISearchResult[typeof tab]>(
    searchResults,
    platform,
    tab,
  );

  const ResultComponent = renderMap[tab]!;
  return <ResultComponent platform={platform} data={data}></ResultComponent>;
}