import React from 'react';
import ListItem from '@/components/base/listItem';
import {ImgAsset} from '@/constants/assetsConst';
import rpx from '@/utils/rpx';

interface IAlbumResultsProps {
    lyricItem: ILyric.ILyricItem;
    onPress?: (musicItem: ILyric.ILyricItem) => void;
}
const ITEM_HEIGHT = rpx(120);
export default function LyricItem(props: IAlbumResultsProps) {
    const {lyricItem, onPress} = props;

    return (
        <ListItem
            left={{
                artwork: lyricItem.artwork,
                fallback: ImgAsset.albumDefault,
            }}
            itemHeight={ITEM_HEIGHT}
            title={lyricItem.title}
            desc={lyricItem.artist ?? ''}
            tag={lyricItem.platform}
            onPress={() => {
                onPress?.(lyricItem);
            }}
        />
    );
}
