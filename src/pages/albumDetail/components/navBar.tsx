import React from 'react';
import {Appbar} from 'react-native-paper';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import {useNavigation} from '@react-navigation/native';
import useColors from '@/hooks/useColors';
import {ROUTE_PATH} from '@/entry/router';

interface INavBarProps {
    musicList: IMusic.IMusicItem[] | null;
}

export default function (props: INavBarProps) {
    const navigation = useNavigation<any>();
    const colors = useColors();

    return (
        <Appbar.Header
            style={[style.appbar, {backgroundColor: colors.primary}]}>
            <Appbar.BackAction
                onPress={() => {
                    navigation.goBack();
                }}
            />
            <Appbar.Content title="专辑" />
            <Appbar.Action
                icon="magnify"
                onPress={() => {
                    navigation.navigate(ROUTE_PATH.SEARCH_MUSIC_LIST, {
                        musicList: props?.musicList ?? [],
                    });
                }}
            />
            <Appbar.Action icon={'dots-vertical'} onPress={() => {}} />
        </Appbar.Header>
    );
}

const style = StyleSheet.create({
    appbar: {
        shadowColor: 'transparent',
        flexDirection: 'row',
        width: rpx(750),
    },
});
