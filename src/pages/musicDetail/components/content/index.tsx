import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import AlbumCover from './albumCover';
import Lyric from './lyric';
import {TapGestureHandler} from 'react-native-gesture-handler';
import useOrientation from '@/hooks/useOrientation';

export default function Content() {
    const [tab, selectTab] = useState<'album' | 'lyric'>('album');
    const orientation = useOrientation();

    const onPress = () => {
        if (orientation === 'horizonal') {
            return;
        }
        if (tab === 'album') {
            selectTab('lyric');
        } else {
            selectTab('album');
        }
    };

    return (
        <TapGestureHandler onActivated={onPress}>
            <View style={style.wrapper}>
                {tab === 'album' || orientation === 'horizonal' ? (
                    <AlbumCover />
                ) : (
                    <Lyric />
                )}
            </View>
        </TapGestureHandler>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: '100%',
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
