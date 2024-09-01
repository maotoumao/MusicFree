import React from 'react';
import ListItem from '@/components/base/listItem';
import {ImgAsset} from '@/constants/assetsConst';
import TitleAndTag from './titleAndTag';

interface IAlbumResultsProps {
    lyricItem: ILyric.ILyricItem;
    onPress?: (musicItem: ILyric.ILyricItem) => void;
}
export default function LyricItem(props: IAlbumResultsProps) {
    const {lyricItem, onPress} = props;

    return (
        <ListItem
            heightType="big"
            withHorizontalPadding
            onPress={() => {
                onPress?.(lyricItem);
            }}>
            <ListItem.ListItemImage
                uri={lyricItem.artwork}
                fallbackImg={ImgAsset.albumDefault}
            />
            <ListItem.Content
                description={lyricItem.artist ?? ''}
                title={
                    <TitleAndTag
                        title={lyricItem.title}
                        tag={lyricItem.platform}
                    />
                }
            />
        </ListItem>
    );
}
