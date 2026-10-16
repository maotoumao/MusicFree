import { describe, expect, it } from "@jest/globals";
import type { SourceHealthSummary } from "@/core/sourceHealth/model";
import { calculateSourceHealth, updateSourceHealthRecord } from "@/core/sourceHealth/model";
import {
    mergeTracks,
    normalizeTrackText,
    orderCandidates,
} from "./model";

const health: Record<string, SourceHealthSummary> = {
    best: { score: 91, status: "excellent" },
    good: { score: 72, status: "healthy" },
    tested: { score: 55, status: "unstable" },
    new: { score: null, status: "untested" },
    poor: { score: 21, status: "poor" },
};
const getHealth = (platform: string) => health[platform] ?? health.new;
const sourceOrder = new Map(["poor", "new", "tested", "good", "best"].map((name, i) => [name, i]));

function track(
    platform: string,
    id: string,
    title = "Song",
    extras: Partial<IMusic.IMusicItem> = {},
): IMusic.IMusicItem {
    return {
        platform,
        id,
        title,
        artist: "Artist",
        duration: 180,
        album: "",
        artwork: "",
        ...extras,
    };
}

describe("aggregate search matching", () => {
    it("folds width, case, whitespace and ordinary punctuation", () => {
        expect(normalizeTrackText("  ＳＯＮＧ，　Ｌｏｖｅ！ ")).toBe("song love");
        expect(normalizeTrackText("Song - Love")).toBe("song love");
        expect(normalizeTrackText("It's  Me")).toBe("its me");
        expect(normalizeTrackText("《Ｓｏｎｇ》…\tLove")).toBe("song love");
        expect(normalizeTrackText(null)).toBe("");
    });

    it("merges punctuation and spacing differences in both title and artist", () => {
        const groups = mergeTracks([], [
            track("best", "1", "夜　曲", { artist: "周 杰伦" }),
            track("good", "2", "《夜曲》", { artist: "周杰伦" }),
            track("new", "3", "夜曲", { artist: "另一位歌手" }),
        ], getHealth, sourceOrder);
        expect(groups).toHaveLength(2);
        expect(groups[0].candidates).toHaveLength(2);
    });

    it.each([
        ["Song", "Song (Live)"],
        ["Song", "Song Remix"],
        ["Song", "Song Cover"],
        ["Song", "Song Acoustic"],
        ["Song", "Song Instrumental"],
        ["Song", "Song 伴奏"],
        ["Song", "Song DJ"],
        ["Song (Version 1)", "Song (Version 2)"],
        ["Song (Version 1.0)", "Song (Version 10)"],
        ["Song (Radio Edit)", "Song (Extended Edit)"],
        ["Alive", "A (Live)"],
    ])("keeps %s separate from %s", (a, b) => {
        expect(mergeTracks([], [track("best", "1", a), track("good", "2", b)],
            getHealth, sourceOrder)).toHaveLength(2);
    });

    it("distinguishes versions in album, alias and plugin version fields", () => {
        for (const field of ["album", "alias", "version"]) {
            expect(mergeTracks([], [
                track("best", "1", "Song", { [field]: "Live 2020" }),
                track("good", "2", "Song", { [field]: "Live 2024" }),
            ], getHealth, sourceOrder)).toHaveLength(2);
        }
    });

    it("allows identical marked versions with ordinary formatting differences", () => {
        expect(mergeTracks([], [
            track("best", "1", "ＳＯＮＧ（ＬＩＶＥ）"),
            track("good", "2", "Song - Live"),
        ], getHealth, sourceOrder)).toHaveLength(1);
    });

    it("does not guess when title or artist is missing", () => {
        for (const field of ["title", "artist"]) {
            expect(mergeTracks([], [
                track("best", "1", "Song", { [field]: "" }),
                track("good", "2", "Song", { [field]: "" }),
            ], getHealth, sourceOrder)).toHaveLength(2);
        }
    });

    it("preserves actual source objects and leaves input and previous pages untouched", () => {
        const first = track("good", "1");
        const best = track("best", "2", "Song", { url: "https://example.test/music", pluginToken: "token" });
        const oldGroups = mergeTracks([], [first], getHealth, sourceOrder);
        const nextGroups = mergeTracks(oldGroups, [best], getHealth, sourceOrder);
        expect(oldGroups[0].candidates).toEqual([first]);
        expect(nextGroups[0].key).toBe(oldGroups[0].key);
        expect(nextGroups[0].candidates[0]).toBe(best);
        expect(nextGroups[0].candidates[1]).toBe(first);
        expect(first.url).toBeUndefined();
    });

    it("merges matching tracks and fills missing display metadata", () => {
        const groups = mergeTracks(
            [],
            [
                track("best", "1", "Ｓｏｎｇ - Love", { duration: 0 }),
                track("good", "2", "song，love", {
                    artist: "ＡＲＴＩＳＴ",
                    duration: 181,
                    album: "Album",
                    artwork: "cover.jpg",
                }),
            ],
            getHealth,
            sourceOrder,
        );
        expect(groups).toHaveLength(1);
        expect(groups[0].candidates.map(item => item.platform)).toEqual(["best", "good"]);
        expect(groups[0].canonical).toMatchObject({
            platform: "best",
            duration: 181,
            album: "Album",
            artwork: "cover.jpg",
        });
    });

    it("keeps named versions and materially different durations separate", () => {
        const titles = [
            "Song",
            "Song (Live)",
            "Song - Remix",
            "Song [Cover]",
            "Song Acoustic",
            "Song Instrumental",
            "Song 伴奏",
            "Song DJ Version",
        ];
        const groups = mergeTracks(
            [],
            titles.map((title, i) => track(`source${i}`, String(i), title)),
            getHealth,
            sourceOrder,
        );
        expect(groups).toHaveLength(titles.length);
        expect(mergeTracks([], [
            track("best", "a", "Song", { duration: 180 }),
            track("good", "b", "song", { duration: 210 }),
        ], getHealth, sourceOrder)).toHaveLength(2);
        expect(mergeTracks([], [
            track("best", "c", "Song", { album: "Studio Album" }),
            track("good", "d", "Song", { album: "Live at Home" }),
        ], getHealth, sourceOrder)).toHaveLength(2);
    });

    it("keeps distinct IDs from one plugin separate and skips repeated page IDs", () => {
        const firstPage = mergeTracks([], [
            track("best", "one"),
            track("best", "two"),
        ], getHealth, sourceOrder);
        expect(firstPage).toHaveLength(2);
        const secondPage = mergeTracks(firstPage, [
            track("best", "one"),
            track("good", "three"),
        ], getHealth, sourceOrder);
        expect(secondPage).toHaveLength(3); // two possible matches: do not guess
        expect(secondPage.flatMap(group => group.candidates)).toHaveLength(3);

        const unambiguous = mergeTracks(
            mergeTracks([], [track("best", "one")], getHealth, sourceOrder),
            [track("best", "one"), track("good", "three")],
            getHealth,
            sourceOrder,
        );
        expect(unambiguous).toHaveLength(1);
        expect(unambiguous[0].candidates).toHaveLength(2);
    });

});

describe("aggregate source ordering", () => {
    it("places healthy tested sources first, then untested, then poor", () => {
        const ordered = orderCandidates(
            ["poor", "new", "tested", "good", "best"].map(name => track(name, name)),
            getHealth,
            sourceOrder,
        );
        expect(ordered.map(item => item.platform)).toEqual([
            "best", "good", "new", "tested", "poor",
        ]);
    });

    it("uses plugin order to break equal health scores", () => {
        const ordered = orderCandidates(
            [track("second", "2"), track("first", "1")],
            () => health.good,
            new Map([["first", 0], ["second", 1]]),
        );
        expect(ordered.map(item => item.platform)).toEqual(["first", "second"]);
    });

    it("breaks remaining ties by name and ID without reordering the input array", () => {
        const candidates = [track("z", "1"), track("a", "2"), track("a", "1")];
        const ordered = orderCandidates(candidates, () => health.good, new Map());
        expect(ordered.map(item => `${item.platform}:${item.id}`)).toEqual(["a:1", "a:2", "z:1"]);
        expect(candidates[0].platform).toBe("z");
        expect(orderCandidates([...candidates].reverse(), () => health.good, new Map())).toEqual(ordered);
    });

    it("uses real MVP-01 summaries for healthy, untested and failing sources", () => {
        let healthyRecord;
        let failingRecord;
        for (let i = 0; i < 12; i += 1) {
            healthyRecord = updateSourceHealthRecord(healthyRecord, "media", true, 100);
            failingRecord = updateSourceHealthRecord(failingRecord, "media", false, 100);
        }
        const summaries = {
            good: calculateSourceHealth(healthyRecord),
            new: calculateSourceHealth(undefined),
            poor: calculateSourceHealth(failingRecord),
        };
        const ordered = orderCandidates(
            [track("poor", "1"), track("new", "1"), track("good", "1")],
            name => summaries[name as keyof typeof summaries], sourceOrder,
        );
        expect(ordered.map(item => item.platform)).toEqual(["good", "new", "poor"]);
    });
});
