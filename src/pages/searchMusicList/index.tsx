import React, {useState} from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import {useNavigation, useRoute} from '@react-navigation/native';
import MusicBar from '@/components/musicBar';
import SearchResult from './searchResult';
import StatusBar from '@/components/base/statusBar';
import {Appbar, Searchbar} from 'react-native-paper';
import useColors from '@/hooks/useColors';
import {SafeAreaView} from 'react-native-safe-area-context';
import {fontSizeConst} from '@/constants/uiConst';

function filterMusic(query: string, musicList: IMusic.IMusicItem[]) {
    if (query?.length === 0) {
        return [];
    }
    return musicList.filter(_ =>
        `${_.title} ${_.artist} ${_.album} ${_.platform}`.includes(
            query.trim(),
        ),
    );
}

export default function SearchMusicList() {
    const route = useRoute<any>();
    const navigation = useNavigation();
    const musicList: IMusic.IMusicItem[] = route.params?.musicList ?? [];
    const [result, setResult] = useState<IMusic.IMusicItem[]>([]);
    const [query, setQuery] = useState('');

    console.log(musicList);

    const colors = useColors();

    const onChangeSearch = (_: string) => {
        _ = _.trim();
        setQuery(_);
        setResult(filterMusic(_, musicList));
    };

    return (
        <SafeAreaView style={style.wrapper}>
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
        </SafeAreaView>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        flex: 1,
    },
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
