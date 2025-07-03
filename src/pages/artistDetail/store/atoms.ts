import { RequestStateCode } from "@/constants/commonConst";
import { atom } from "jotai";

export const scrollToTopAtom = atom(true);

export interface IQueryResult<
    T extends IArtist.ArtistMediaType = IArtist.ArtistMediaType,
> {
    state?: RequestStateCode;
    page?: number;
    data?: ICommon.SupportMediaItemBase[T];
}

type IQueryResults<
    K extends IArtist.ArtistMediaType = IArtist.ArtistMediaType,
> = {
    [T in K]: IQueryResult<T>;
};

export const initQueryResult: IQueryResults = {
    music: {},
    album: {},
};

export const queryResultAtom = atom(initQueryResult);
