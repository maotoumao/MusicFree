import {atom} from 'jotai';

export interface ISearchResultState {
  currentPage?: number;
  query?: string;
  pending: boolean;
  result: Array<IPlugin.ISearchResult>;
}
const searchResults: Record<string, ISearchResultState> = {};
const searchResultsAtom = atom(searchResults);



export enum PageStatus {
  /** 编辑中 */
  EDITING = 'EDITING',
  /** 搜索中 */
  SEARCHING = 'SEARCHING',
  /** 有结果 */
  RESULT = 'RESULT',
}

const pageStatusAtom = atom<PageStatus>(PageStatus.EDITING);

// 搜索
const queryAtom = atom<string>('');

export {searchResults, pageStatusAtom, searchResultsAtom, queryAtom};
