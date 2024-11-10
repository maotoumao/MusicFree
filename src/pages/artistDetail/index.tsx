import React, {useEffect} from 'react';
import {StyleSheet, View} from 'react-native';
import MusicBar from '@/components/musicBar';
import Header from './components/header';
import Body from './components/body';
import {useAtom, useSetAtom} from 'jotai';
import {initQueryResult, queryResultAtom, scrollToTopAtom} from './store/atoms';
import {ROUTE_PATH, useNavigate, useParams} from '@/entry/router';
import VerticalSafeAreaView from '@/components/base/verticalSafeAreaView';
import globalStyle from '@/constants/globalStyle';
import useOrientation from '@/hooks/useOrientation';
import AppBar from '@/components/base/appBar';

export default function ArtistDetail() {
    const [queryResult, setQueryResult] = useAtom(queryResultAtom);
    const {artistItem} = useParams<'artist-detail'>();
    const setScrollToTopState = useSetAtom(scrollToTopAtom);
    const navigate = useNavigate();
    const orientation = useOrientation();

    useEffect(() => {
        return () => {
            setQueryResult(initQueryResult);
            setScrollToTopState(true);
        };
    }, []);

    return (
        <VerticalSafeAreaView style={globalStyle.fwflex1}>
            <AppBar
                withStatusBar
                menu={[
                    {
                        title: '批量编辑单曲',
                        icon: 'pencil-square',
                        onPress() {
                            navigate(ROUTE_PATH.MUSIC_LIST_EDITOR, {
                                musicList: queryResult?.music?.data ?? [],
                                musicSheet: {
                                    title: `${artistItem.name} - 单曲`,
                                },
                            });
                        },
                    },
                ]}>
                作者
            </AppBar>
            <View
                style={
                    orientation === 'horizontal'
                        ? style.horizontal
                        : globalStyle.flex1
                }>
                <Header neverFold={orientation === 'horizontal'} />
                <Body />
            </View>

            <MusicBar />
        </VerticalSafeAreaView>
    );
}

const style = StyleSheet.create({
    horizontal: {
        flexDirection: 'row',
        flex: 1,
    },
});
