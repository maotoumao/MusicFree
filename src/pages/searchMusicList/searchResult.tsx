import React from 'react';
import {FlatList} from 'react-native-gesture-handler';
import MusicItem from '@/components/mediaItem/musicItem';
import Empty from '@/components/base/empty';

interface ISearchResultProps {
    result: IMusic.IMusicItem[];
    musicSheet?: IMusic.IMusicSheetItem;
}
export default function SearchResult(props: ISearchResultProps) {
    const {result, musicSheet} = props;
    return (
        <FlatList
            ListEmptyComponent={<Empty />}
            data={result}
            renderItem={({item}) => (
                <MusicItem musicItem={item} musicSheet={musicSheet} />
            )}
        />
    );
}
