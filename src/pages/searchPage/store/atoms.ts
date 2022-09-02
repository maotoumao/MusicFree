import {atom} from 'jotai';

/** 搜索状态 */
export enum SearchStateCode {
  /** 检索第一页 */
  IDLE = 0,
  PENDING_FP = 1,
  /** 检索中 */
  PENDING = 2,
  /** 部分结束 */
  PARTLY_DONE = 4,
  /** 全部结束 */
  FINISHED = 5,
}

export interface ISearchResult<T extends ICommon.SupportMediaType> {
  /** 当前页码 */
  page?: number;
  /** 搜索词 */
  query?: string;
  /** 搜索状态 */
  state: SearchStateCode;
  /** 数据 */
  data: ICommon.SupportMediaItemBase[T][];
}

type ISearchResults<
  T extends keyof ICommon.SupportMediaItemBase = ICommon.SupportMediaType,
> = {
  [K in T]: Record<string, ISearchResult<K>>;
};

/** 初始值 */
export const initSearchResults: ISearchResults = {
  music: {},
  album: {},
  artist: {},
  // lyric: {}
};

/** key: pluginhash value: searchResult */
const searchResultsAtom = atom(initSearchResults);

export enum PageStatus {
  /** 编辑中 */
  EDITING = 'EDITING',
  /** 搜索中 */
  SEARCHING = 'SEARCHING',
  /** 有结果 */
  RESULT = 'RESULT',
}

/** 当前正在搜索的 */
const pageStatusAtom = atom<PageStatus>(PageStatus.EDITING);

const queryAtom = atom<string>('');

export {pageStatusAtom, searchResultsAtom, queryAtom};
