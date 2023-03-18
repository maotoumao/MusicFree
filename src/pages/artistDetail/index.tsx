import React, {useEffect} from 'react';
import {StyleSheet, View} from 'react-native';
import StatusBar from '@/components/base/statusBar';
import MusicBar from '@/components/musicBar';
import Header from './components/header';
import Body from './components/body';
import {useAtom, useSetAtom} from 'jotai';
import {initQueryResult, queryResultAtom, scrollToTopAtom} from './store/atoms';
import ComplexAppBar from '@/components/base/ComplexAppBar';
import {ROUTE_PATH, useNavigate, useParams} from '@/entry/router';
import VerticalSafeAreaView from '@/components/base/verticalSafeAreaView';
import globalStyle from '@/constants/globalStyle';
import useOrientation from '@/hooks/useOrientation';

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
            <View
                style={
                    orientation === 'horizonal'
                        ? style.horizonal
                        : globalStyle.flex1
                }>
                <Header neverFold={orientation === 'horizonal'} />
                <Body />
            </View>

            <MusicBar />
        </VerticalSafeAreaView>
    );
}

const style = StyleSheet.create({
    horizonal: {
        flexDirection: 'row',
        flex: 1,
    },
});
