import { RequestStateCode } from "@/constants/commonConst";
import { atom } from "jotai";

/** 搜索状态 */

export interface ISearchResult<T extends ICommon.SupportMediaType> {
    /** 当前页码 */
    page?: number;
    /** 搜索词 */
    query?: string;
    /** 搜索状态 */
    state: RequestStateCode;
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
    sheet: {},
    lyric: {},
};

/** key: pluginhash value: searchResult */
const searchResultsAtom = atom(initSearchResults);

export enum PageStatus {
    /** 编辑中 */
    EDITING = "EDITING",
    /** 搜索中 */
    SEARCHING = "SEARCHING",
    /** 有结果 */
    RESULT = "RESULT",
    /** 没有安装插件 */
    NO_PLUGIN = "NO_PLUGIN",
}

/** 当前正在搜索的 */
const pageStatusAtom = atom<PageStatus>(PageStatus.EDITING);

const queryAtom = atom<string>("");

export { pageStatusAtom, searchResultsAtom, queryAtom };
