import { SongIdentity, songKey } from "../musicIdentity";
import { prepareTarget } from "./playback";
import { SearchConfig } from "./config";
import { preparedTargetKey } from "./preparedSource";

/** Prepare the whole batch, with on-screen songs first and only two workers. */
export function warmRecommendations(targets: SongIdentity[], onReady: (target: SongIdentity, track: IMusic.IMusicItem) => void = () => {},
    enabled: () => boolean = () => true, visibleKeys: string[] = []) {
    let active = true;
    let workers = 0;
    let visible = new Set(visibleKeys);
    const preferred = new Set<string>();
    const backup = new Set<string>();
    const running = new Set<string>();
    const unique = [...new Map(targets.map(target => [preparedTargetKey(target), target])).values()];
    const current = () => active && enabled();
    const take = () => {
        const ordered = [...unique].sort((a, b) => Number(visible.has(songKey(b))) - Number(visible.has(songKey(a))));
        // Finish visible songs, including fallback, before warming off-screen
        // rows. Otherwise a failing primary can delay this whole page by minutes.
        const visibleTarget = ordered.find(song => visible.has(songKey(song)) && !backup.has(preparedTargetKey(song)) && !running.has(preparedTargetKey(song)));
        if (visibleTarget) {
            const key = preparedTargetKey(visibleTarget);
            preferred.add(key);
            backup.add(key);
            running.add(key);
            return { target: visibleTarget, key, allowBackup: true };
        }
        for (const allowBackup of [false, true]) {
            const attempted = allowBackup ? backup : preferred;
            const target = ordered.find(song => !attempted.has(preparedTargetKey(song)) && !running.has(preparedTargetKey(song)));
            if (target) {
                const key = preparedTargetKey(target);
                attempted.add(key);
                running.add(key);
                return { target, key, allowBackup };
            }
        }
    };
    const work = async () => {
        while (current()) {
            const item = take();
            if (!item) break;
            try {
                const value = await prepareTarget(item.target, current, 0, item.allowBackup);
                if (value && current()) {
                    backup.add(item.key);
                    onReady(item.target, value.track);
                }
            } catch { /* A failed warmup must not block other recommendations. */ } finally {
                running.delete(item.key);
            }
        }
    };
    const start = () => {
        while (current() && workers < SearchConfig.backgroundConcurrency) {
            workers++;
            work().finally(() => {
                workers--;
            });
        }
    };
    const timer = setInterval(() => {
        preferred.clear();
        backup.clear();
        start();
    }, 60000);
    start();
    return {
        prioritize(keys: string[]) {
            visible = new Set(keys); start();
        },
        stop() {
            active = false; clearInterval(timer);
        },
    };
}
