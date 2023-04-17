import React, {useState} from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import {useNavigation} from '@react-navigation/native';
import MusicBar from '@/components/musicBar';
import SearchResult from './searchResult';
import StatusBar from '@/components/base/statusBar';
import {Appbar, Searchbar} from 'react-native-paper';
import useColors from '@/hooks/useColors';
import {fontSizeConst} from '@/constants/uiConst';
import {useParams} from '@/entry/router';
import globalStyle from '@/constants/globalStyle';
import VerticalSafeAreaView from '@/components/base/verticalSafeAreaView';

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
    const {musicList} = useParams<'search-music-list'>();
    const navigation = useNavigation();
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
            <Appbar.Header
                style={[style.appbar, {backgroundColor: colors.primary}]}>
                <Appbar.BackAction
                    onPress={() => {
                        navigation.goBack();
                    }}
                />
                <Searchbar
                    style={style.searchBar}
                    inputStyle={style.input}
                    placeholder="在列表中搜索歌曲"
                    value={query}
                    onChangeText={onChangeSearch}
                />
            </Appbar.Header>
            <SearchResult result={result} />
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
        color: '#666666',
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
