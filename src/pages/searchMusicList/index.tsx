import React, {useState} from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import MusicBar from '@/components/musicBar';
import SearchResult from './searchResult';
import StatusBar from '@/components/base/statusBar';
import useColors from '@/hooks/useColors';
import {fontSizeConst} from '@/constants/uiConst';
import {useParams} from '@/entry/router';
import globalStyle from '@/constants/globalStyle';
import VerticalSafeAreaView from '@/components/base/verticalSafeAreaView';
import Input from '@/components/base/input';
import AppBar from '@/components/base/appBar';

function filterMusic(query: string, musicList: IMusic.IMusicItem[]) {
    if (query?.length === 0) {
        return musicList;
    }
    return musicList.filter(_ =>
        `${_.title} ${_.artist} ${_.album} ${_.platform}`
            .toLowerCase()
            .includes(query.toLowerCase()),
    );
}

export default function SearchMusicList() {
    const {musicList, musicSheet} = useParams<'search-music-list'>();
    const [result, setResult] = useState<IMusic.IMusicItem[]>(musicList ?? []);
    const [query, setQuery] = useState('');

    const colors = useColors();

    const onChangeSearch = (_: string) => {
        setQuery(_);
        // useTransition做优化
        setResult(filterMusic(_.trim(), musicList ?? []));
    };

    return (
        <VerticalSafeAreaView style={globalStyle.fwflex1}>
            <StatusBar />
            <AppBar>
                <Input
                    style={style.searchBar}
                    fontColor={colors.appBarText}
                    placeholder="在列表中搜索歌曲"
                    accessible
                    autoFocus
                    accessibilityLabel="搜索框"
                    accessibilityHint={'在列表中搜索歌曲'}
                    value={query}
                    onChangeText={onChangeSearch}
                />
            </AppBar>
            <SearchResult result={result} musicSheet={musicSheet} />
            <MusicBar />
        </VerticalSafeAreaView>
    );
}

const style = StyleSheet.create({
    appbar: {
        shadowColor: 'transparent',
        backgroundColor: '#2b333eaa',
    },
    searchBar: {
        minWidth: rpx(375),
        flex: 1,
        borderRadius: rpx(64),
        height: rpx(64),
        fontSize: rpx(32),
    },
    input: {
        padding: 0,
        color: '#666666',
        height: rpx(64),
        fontSize: fontSizeConst.subTitle,
        textAlignVertical: 'center',
        includeFontPadding: false,
    },
});
