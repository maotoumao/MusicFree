import React, { useEffect, useMemo } from "react";
import useGetTopList from "../hooks/useGetTopList";
import { useAtomValue } from "jotai";
import { pluginsTopListAtom } from "../store/atoms";
import BoardPanel from "./boardPanel";

interface IBoardPanelProps {
    hash: string;
}
export default function BoardPanelWrapper(props: IBoardPanelProps) {
    const { hash } = props ?? {};
    const topLists = useAtomValue(pluginsTopListAtom);
    const getTopList = useGetTopList();
    const topListData = useMemo(() => topLists[hash], [topLists]);

    useEffect(() => {
        getTopList(hash);
    }, []);

    return <BoardPanel topListData={topListData} hash={hash} />;
}
