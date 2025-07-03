import React from "react";
import SheetItem from "@/components/mediaItem/sheetItem";

interface IMusicSheetResultItemProps {
    item: IMusic.IMusicSheetItem;
    pluginHash: string;
}
export default function MusicSheetResultItem(
    props: IMusicSheetResultItemProps,
) {
    const { item, pluginHash } = props;

    return <SheetItem sheetInfo={item} pluginHash={pluginHash} />;
}
