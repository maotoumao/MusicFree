import React from "react";
import AlbumItem from "@/components/mediaItem/albumItem";

interface IAlbumContentProps {
    item: IAlbum.IAlbumItem;
}
export default function AlbumContentItem(props: IAlbumContentProps) {
    const { item } = props;
    return <AlbumItem albumItem={item} />;
}
