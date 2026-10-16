import React from "react";
import MusicItem from "@/components/mediaItem/musicItem";
import Config from "@/core/appConfig";
import { useI18N } from "@/core/i18n";
import { playTarget } from "@/core/aggregateSearch/playback";
import Toast from "@/utils/toast";
import Player from "@/core/trackPlayer";
import type { AggregateTrack } from "@/core/aggregateSearch/model";
import type { IAggregateMusicSearchResult } from "@/pages/searchPage/store/atoms";

interface IAggregateMusicResultItemProps {
    item: AggregateTrack;
    pluginSearchResultRef: React.MutableRefObject<IAggregateMusicSearchResult>;
}

export default function AggregateMusicResultItem({
    item,
    pluginSearchResultRef,
}: IAggregateMusicResultItemProps) {
    const { t } = useI18N();
    return (
        <MusicItem
            musicItem={item.canonical}
            sourceCountLabel={t("searchPage.sourceCount", { count: item.candidates.length })}
            onItemPress={async () => {
                try {
                    const played = await playTarget(item.canonical, item.candidates);
                    if (played && Config.getConfig("basic.clickMusicInSearch") === "playMusicAndReplace") {
                        Player.replaceManagedPlayList(played, pluginSearchResultRef.current?.data.map(group =>
                            group.key === item.key ? played : group.candidates[0]) ?? [played]);
                    }
                } catch {
                    Toast.warn("暂时找不到可播放音源");
                }
            }}
        />
    );
}
