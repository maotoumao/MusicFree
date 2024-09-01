import React from 'react';
import MusicItem from '@/components/mediaItem/musicItem';
import Empty from '@/components/base/empty';
import {FlashList} from '@shopify/flash-list';
import rpx from '@/utils/rpx.ts';

interface ISearchResultProps {
    result: IMusic.IMusicItem[];
    musicSheet?: IMusic.IMusicSheetItem;
}

const ITEM_HEIGHT = rpx(120);

export default function SearchResult(props: ISearchResultProps) {
    const {result, musicSheet} = props;
    return (
        <FlashList
            estimatedItemSize={ITEM_HEIGHT}
            ListEmptyComponent={<Empty />}
            data={result}
            renderItem={({item}) => (
                <MusicItem musicItem={item} musicSheet={musicSheet} />
            )}
        />
    );
}
