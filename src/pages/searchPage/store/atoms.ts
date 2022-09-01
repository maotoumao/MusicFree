import {atom} from 'jotai';

 /** 搜索状态 */
export enum SearchStateCode {
  /** 空闲 */
  IDLE = 0,
  /** 检索中 */
  PENDING = 1,
  /** 部分结束 */
  PARTLY_DONE = 4,
  /** 全部结束 */
  FINISHED = 5
}


export interface ISearchResultState {
  currentPage?: number;
  query?: string;
  state: SearchStateCode; // 搜索中 返回请求 搜索结束
  result: IPlugin.ISearchResult;
}
/** key: pluginhash value: searchResult */
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
