import React from "react";
import MusicItem from "@/components/mediaItem/musicItem";

interface IMusicContentProps {
    item: IMusic.IMusicItem;
}
export default function MusicContentItem(props: IMusicContentProps) {
    const { item } = props;
    return <MusicItem musicItem={item} />;
}
