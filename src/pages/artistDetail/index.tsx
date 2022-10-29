import React, {useEffect} from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import {SafeAreaView} from 'react-native-safe-area-context';
import StatusBar from '@/components/base/statusBar';
import MusicBar from '@/components/musicBar';
import Header from './components/header';
import Body from './components/body';
import {useAtom, useSetAtom} from 'jotai';
import {initQueryResult, queryResultAtom, scrollToTopAtom} from './store/atoms';
import ComplexAppBar from '@/components/base/ComplexAppBar';
import {ROUTE_PATH, useNavigate, useParams} from '@/entry/router';

export default function ArtistDetail() {
    const [queryResult, setQueryResult] = useAtom(queryResultAtom);
    const {artistItem} = useParams<'artist-detail'>();
    const setScrollToTopState = useSetAtom(scrollToTopAtom);
    const navigate = useNavigate();

    useEffect(() => {
        return () => {
            setQueryResult(initQueryResult);
            setScrollToTopState(true);
        };
    }, []);

    return (
        <SafeAreaView style={style.wrapper}>
            <StatusBar />
            <ComplexAppBar
                title="作者"
                menuOptions={[
                    {
                        title: '批量编辑单曲',
                        icon: 'playlist-edit',
                        onPress() {
                            navigate(ROUTE_PATH.MUSIC_LIST_EDITOR, {
                                musicList: queryResult?.music?.data ?? [],
                                musicSheet: {
                                    title: `${artistItem.name} - 单曲`,
                                },
                            });
                        },
                    },
                ]}
            />
            <Header />
            <Body />
            <MusicBar />
        </SafeAreaView>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        flex: 1,
    },
    body: {
        flex: 1,
    },
});
