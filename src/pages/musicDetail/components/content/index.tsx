import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import AlbumCover from './albumCover';
import Lyric from './lyric';
import {TapGestureHandler} from 'react-native-gesture-handler';
import useOrientation from '@/hooks/useOrientation';
import Config from '@/core/config';
import Operations from './operations';
import LyricOperations from './lyricOperations';

export default function Content() {
    const [tab, selectTab] = useState<'album' | 'lyric'>(
        Config.get('setting.basic.musicDetailDefault') || 'album',
    );
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

    const showAlbumCover = tab === 'album' || orientation === 'horizonal';

    return (
        <>
            <TapGestureHandler onActivated={onPress}>
                <View style={style.wrapper}>
                    {showAlbumCover ? <AlbumCover /> : <Lyric />}
                </View>
            </TapGestureHandler>
            {showAlbumCover ? <Operations /> : <LyricOperations />}
        </>
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
