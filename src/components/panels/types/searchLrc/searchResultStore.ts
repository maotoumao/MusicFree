import {RequestStateCode} from '@/constants/commonConst';
import {GlobalState} from '@/utils/stateMapper';

export interface ISearchLyricResult {
    data: ILyric.ILyricItem[];
    state: RequestStateCode;
    page: number;
}

interface ISearchLyricStoreData {
    query?: string;
    // plugin - result
    data: Record<string, ISearchLyricResult>;
}

const c = new GlobalState<ISearchLyricStoreData>({data: {}});
export default c;
// @ts-ignore
global.ck = c;
