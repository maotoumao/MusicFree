import React from 'react';
import MusicItem from '@/components/mediaItem/musicItem';
import Config from '@/core/config';
import MusicQueue from '@/core/musicQueue';
import {ISearchResult} from '@/pages/searchPage/store/atoms';

interface IMusicResultsProps {
    item: IMusic.IMusicItem;
    index: number;
    pluginSearchResultRef: React.MutableRefObject<ISearchResult<'music'>>;
}

export default function MusicResultItem(props: IMusicResultsProps) {
    const {item: musicItem, pluginSearchResultRef} = props;

    return (
        <MusicItem
            musicItem={musicItem}
            onItemPress={() => {
                const clickBehavior = Config.get(
                    'setting.basic.clickMusicInSearch',
                );
                if (clickBehavior === '播放歌曲并替换播放列表') {
                    MusicQueue.playWithReplaceQueue(
                        musicItem,
                        (pluginSearchResultRef?.current?.data ?? [
                            musicItem,
                        ]) as IMusic.IMusicItem[],
                    );
                } else {
                    MusicQueue.play(musicItem);
                }
            }}
        />
    );
}
