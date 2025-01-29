import React from "react";
import MusicItem from "@/components/mediaItem/musicItem";
import Config from "@/core/config.ts";
import { ISearchResult } from "@/pages/searchPage/store/atoms";
import TrackPlayer from "@/core/trackPlayer";

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
                const clickBehavior = Config.getConfig(
                    'basic.clickMusicInSearch',
                );
                if (clickBehavior === '播放歌曲并替换播放列表') {
                    TrackPlayer.playWithReplacePlayList(
                        musicItem,
                        (pluginSearchResultRef?.current?.data ?? [
                            musicItem,
                        ]) as IMusic.IMusicItem[],
                    );
                } else {
                    TrackPlayer.play(musicItem);
                }
            }}
        />
    );
}
