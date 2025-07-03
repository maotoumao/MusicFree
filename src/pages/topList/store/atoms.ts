import { RequestStateCode } from "@/constants/commonConst";
import { atom } from "jotai";

export interface IPluginTopListResult {
    state: RequestStateCode;
    data: IMusic.IMusicSheetGroupItem[];
}

const pluginsTopListAtom = atom<Record<string, IPluginTopListResult>>({});

export { pluginsTopListAtom };
