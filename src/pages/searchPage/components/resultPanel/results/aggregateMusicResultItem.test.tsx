import React from "react";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { act, create } from "react-test-renderer";
import MusicItem from "@/components/mediaItem/musicItem";
import Config from "@/core/appConfig";
import TrackPlayer from "@/core/trackPlayer";
import { playTarget } from "@/core/aggregateSearch/playback";
import { mergeTracks } from "@/core/aggregateSearch/model";
import { RequestStateCode } from "@/constants/commonConst";
import AggregateMusicResultItem from "./aggregateMusicResultItem";

jest.mock("react-native-reanimated", () => ({ Easing: { out: () => () => 0 } }));
jest.mock("@/components/mediaItem/musicItem", () => jest.fn(() => null));
jest.mock("@/core/appConfig", () => ({ getConfig: jest.fn() }));
jest.mock("@/core/trackPlayer", () => ({ replaceManagedPlayList: jest.fn() }));
jest.mock("@/core/aggregateSearch/playback", () => ({ playTarget: jest.fn() }));
jest.mock("@/utils/toast", () => ({ warn: jest.fn() }));
jest.mock("@/core/i18n", () => ({
    useI18N: () => ({ t: (_: string, params: { count: number }) => `${params.count} 个音源` }),
}));

afterEach(() => {
    jest.clearAllMocks();
});

describe("aggregate music row playback", () => {
    it.each([false, true])("passes real candidates to TrackPlayer (replace playlist: %s)", async replace => {
        jest.mocked(Config.getConfig).mockReturnValue(replace ? "playMusicAndReplace" : "playMusic");
        const best: IMusic.IMusicItem = {
            id: "best", platform: "healthy", title: "Song", artist: "Artist",
            duration: 180, album: "", artwork: "", pluginToken: "keep-me",
        };
        const other = { ...best, id: "other", platform: "untested", album: "Display Album" };
        const next = { ...best, id: "next", title: "Another Song" };
        const groups = mergeTracks([], [other, best, next], name => name === "healthy"
            ? { score: 90, status: "excellent" }
            : { score: null, status: "untested" }, new Map());
        const ref = { current: {
            state: RequestStateCode.FINISHED, data: groups, requestId: 1, endedPlugins: [],
        } };
        const renderer = create(<AggregateMusicResultItem item={groups[0]} pluginSearchResultRef={ref} />);
        const props = renderer.root.findByType(MusicItem).props;
        expect(props.sourceCountLabel).toBe("2 个音源");
        jest.mocked(playTarget).mockResolvedValue(best);
        await act(async () => {
            await props.onItemPress();
        });
        expect(playTarget).toHaveBeenCalledWith(groups[0].canonical, groups[0].candidates);
        if (replace) {
            expect(TrackPlayer.replaceManagedPlayList).toHaveBeenCalledWith(best, [best, next]);
        } else {
            expect(TrackPlayer.replaceManagedPlayList).not.toHaveBeenCalled();
        }
        expect(best.album).toBe("");
        renderer.unmount();
    });
});
