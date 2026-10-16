import { SongIdentity, matchTarget } from "../musicIdentity";

/** Pure, bounded candidate runner used by the actual Android playback adapter. */
export async function tryCandidates(
    target: SongIdentity,
    candidates: IMusic.IMusicItem[],
    attempt: (track: IMusic.IMusicItem) => Promise<boolean>,
    isCurrent: () => boolean = () => true,
): Promise<IMusic.IMusicItem | undefined> {
    const seen = new Set<string>();
    for (const track of [...candidates].sort((a, b) => matchTarget(target, b) - matchTarget(target, a))) {
        if (!isCurrent()) return undefined;
        const key = JSON.stringify([track.platform, track.id]);
        if (seen.has(key) || !matchTarget(target, track)) continue;
        seen.add(key);
        try {
            if (await attempt(track) && isCurrent()) return track;
        } catch { /* Next source. */ }
    }
    return undefined;
}
