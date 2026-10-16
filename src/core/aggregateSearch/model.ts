import type { SourceHealthSummary } from "@/core/sourceHealth/model";
import { simplified } from "../musicIdentity";

export interface AggregateTrack {
    key: string;
    canonical: IMusic.IMusicItem;
    candidates: IMusic.IMusicItem[];
}

/** Keep words (including version labels) while folding display-only punctuation. */
export function normalizeTrackText(value: unknown): string {
    if (typeof value !== "string") return "";
    return simplified(value)
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[’'`]/g, "")
        .replace(/[\s\p{P}]+/gu, " ")
        .trim()
        .replace(/\s+/g, " ");
}

function trackKey(track: IMusic.IMusicItem): string | null {
    const title = normalizeTrackText(track.title).replace(/\s/g, "");
    const artist = normalizeTrackText(track.artist).replace(/\s/g, "");
    return title && artist ? JSON.stringify([title, artist]) : null;
}

const variantMarkers = [
    "live", "remix", "cover", "acoustic", "instrumental", "dj",
    "version", "ver", "edit", "demo", "karaoke", "unplugged", "remaster", "mix",
    "伴奏", "现场", "現場", "翻唱", "混音", "纯音乐", "純音樂", "版", "不插电", "重制",
];

function variantSignature(track: IMusic.IMusicItem): string {
    // Keep full version-bearing fields, including years and mix names. Merely
    // remembering "live" would merge different concerts with identical titles.
    // Boundaries also keep "Alive" distinct from "A (Live)" after space folding.
    const fields = [track.title, track.artist, track.alias, track.album].map(value => {
        const text = normalizeTrackText(value);
        const marked = variantMarkers.some(marker => /^[a-z]/.test(marker)
            ? new RegExp(`(?:^|[^a-z])${marker}(?:ed|s)?(?:$|[^a-z])`).test(text)
            : text.includes(marker));
        return marked ? text : "";
    });
    return JSON.stringify([...fields, normalizeTrackText(track.version)]);
}

function hasSameRecordingDuration(
    candidates: IMusic.IMusicItem[],
    track: IMusic.IMusicItem,
): boolean {
    const duration = Number(track.duration);
    if (!Number.isFinite(duration) || duration <= 0) return true;
    return candidates.every(candidate => {
        const other = Number(candidate.duration);
        return !Number.isFinite(other) || other <= 0 || Math.abs(other - duration) <= 8;
    });
}

function healthRank(health: SourceHealthSummary): number {
    if (health.score === null) return 1;
    if (health.score >= 70) return 0;
    return health.score >= 40 ? 2 : 3;
}

// Code-point ordering is independent of the device's locale/Intl implementation.
function compareText(a: string, b: string): number {
    if (a === b) return 0;
    return a < b ? -1 : 1;
}

export function orderCandidates(
    candidates: IMusic.IMusicItem[],
    getHealth: (pluginName: string) => SourceHealthSummary,
    sourceOrder: ReadonlyMap<string, number>,
): IMusic.IMusicItem[] {
    const health = new Map(candidates.map(item => [item.platform, getHealth(item.platform)]));
    return [...candidates].sort((a, b) => {
        const aHealth = health.get(a.platform)!;
        const bHealth = health.get(b.platform)!;
        return (
            healthRank(aHealth) - healthRank(bHealth) ||
            (bHealth.score ?? 0) - (aHealth.score ?? 0) ||
            (sourceOrder.get(a.platform) ?? Infinity) -
                (sourceOrder.get(b.platform) ?? Infinity) ||
            compareText(a.platform, b.platform) ||
            compareText(String(a.id), String(b.id))
        );
    });
}

function makeCanonical(candidates: IMusic.IMusicItem[]): IMusic.IMusicItem {
    const best = candidates[0];
    const withDuration = candidates.find(item => Number(item.duration) > 0);
    const withAlbum = candidates.find(item => item.album?.trim());
    const withArtwork = candidates.find(item => item.artwork?.trim());
    return {
        ...best,
        duration: Number(best.duration) > 0
            ? Number(best.duration)
            : Number(withDuration?.duration) || 0,
        album: best.album?.trim() ? best.album : withAlbum?.album ?? "",
        artwork: best.artwork?.trim() ? best.artwork : withArtwork?.artwork ?? "",
    };
}

/** Rebuild from loaded pages so repeated IDs are dropped across page boundaries. */
export function mergeTracks(
    previous: AggregateTrack[],
    incoming: IMusic.IMusicItem[],
    getHealth: (pluginName: string) => SourceHealthSummary,
    sourceOrder: ReadonlyMap<string, number>,
): AggregateTrack[] {
    const groups = previous.map(group => ({
        key: group.key,
        candidates: [...group.candidates],
    }));
    const seenIds = new Set(
        groups.flatMap(group =>
            group.candidates
                .map(item => JSON.stringify([item.platform, item.id])),
        ),
    );

    incoming.forEach((track, index) => {
        if (!track || !track.platform || track.id == null || track.id === "") return;
        const mediaId = JSON.stringify([track.platform, track.id]);
        if (seenIds.has(mediaId)) return;
        seenIds.add(mediaId);

        const normalizedKey = trackKey(track);
        const version = variantSignature(track);
        const matches = groups.filter(group => {
            return normalizedKey &&
                trackKey(group.candidates[0]) === normalizedKey &&
                variantSignature(group.candidates[0]) === version &&
                !group.candidates.some(item => item.platform === track.platform) &&
                hasSameRecordingDuration(group.candidates, track);
        });
        // Multiple compatible recordings are ambiguous: keep the new result separate.
        if (matches.length === 1) {
            matches[0].candidates.push(track);
        } else {
            groups.push({
                key: `${normalizedKey ?? "unknown"}\u0000${mediaId}\u0000${index}`,
                candidates: [track],
            });
        }
    });

    return groups.map(group => {
        const candidates = orderCandidates(group.candidates, getHealth, sourceOrder);
        return {
            key: group.key,
            canonical: makeCanonical(candidates),
            candidates,
        };
    });
}
