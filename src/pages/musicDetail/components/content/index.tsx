import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import AlbumCover from './albumCover';
import Lyric from './lyric';
import {TapGestureHandler} from 'react-native-gesture-handler';

export default function Content() {
    const [tab, selectTab] = useState<'album' | 'lyric'>('album');

    const onPress = () => {
        if (tab === 'album') {
            selectTab('lyric');
        } else {
            selectTab('album');
        }
    };

    return (
        <TapGestureHandler onActivated={onPress}>
            <View style={style.wrapper}>
                {tab === 'album' ? <AlbumCover /> : <Lyric />}
            </View>
        </TapGestureHandler>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
