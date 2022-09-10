import React from 'react';
import AlbumItem from '@/components/mediaItem/albumItem';

interface IAlbumResultsProps {
    item: IAlbum.IAlbumItem;
    index: number;
}
/** todo 很多rerender，需要避免掉 */
export default function AlbumResultItem(props: IAlbumResultsProps) {
    const {item: albumItem} = props;

    return <AlbumItem albumItem={albumItem} />;
}
