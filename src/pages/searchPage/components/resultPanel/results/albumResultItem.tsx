import React from "react";
import AlbumItem from "@/components/mediaItem/albumItem";

interface IAlbumResultsProps {
    item: IAlbum.IAlbumItem;
    index: number;
}

export default function AlbumResultItem(props: IAlbumResultsProps) {
    const { item: albumItem } = props;

    return <AlbumItem albumItem={albumItem} />;
}
