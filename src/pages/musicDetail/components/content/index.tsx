import React, {useState} from 'react';
import {View} from 'react-native';
import AlbumCover from './albumCover';
import Lyric from './lyric';
import useOrientation from '@/hooks/useOrientation';
import Config from '@/core/config';
import globalStyle from '@/constants/globalStyle';

export default function Content() {
    const [tab, selectTab] = useState<'album' | 'lyric'>(
        Config.get('setting.basic.musicDetailDefault') || 'album',
    );
    const orientation = useOrientation();
    const showAlbumCover = tab === 'album' || orientation === 'horizontal';

    const onTurnPageClick = () => {
        if (orientation === 'horizontal') {
            return;
        }
        if (tab === 'album') {
            selectTab('lyric');
        } else {
            selectTab('album');
        }
    };

    return (
        <View style={globalStyle.fwflex1}>
            {showAlbumCover ? (
                <AlbumCover onTurnPageClick={onTurnPageClick} />
            ) : (
                <Lyric onTurnPageClick={onTurnPageClick} />
            )}
        </View>
    );
}
