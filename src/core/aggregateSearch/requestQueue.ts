/** Shared by aggregate and single-source music searches, including overlapping queries. */
import { SearchConfig } from "./config";
const MAX_CONCURRENT_SEARCHES = SearchConfig.concurrency;
let active = 0;
let backgroundActive = 0;
export type RequestPriority = number | (() => number);
const waiting: Array<{ start: (background: boolean) => void; priority: RequestPriority }> = [];
const valueOf = (priority: RequestPriority) => typeof priority === "function" ? priority() : priority;

function drain() {
    waiting.sort((a, b) => valueOf(b.priority) - valueOf(a.priority));
    while (active < MAX_CONCURRENT_SEARCHES) {
        // Slow/uncancellable warmups must leave capacity for a user's click.
        const index = waiting.findIndex(job => valueOf(job.priority) > 0 || backgroundActive < SearchConfig.backgroundConcurrency);
        if (index < 0) return;
        const [job] = waiting.splice(index, 1);
        const background = valueOf(job.priority) <= 0;
        active++;
        if (background) backgroundActive++;
        job.start(background);
    }
}

export function reprioritizeMusicRequests() {
    drain();
}

export async function scheduleMusicSearch<T>(
    search: () => Promise<T>,
    isCurrent: () => boolean = () => true,
    priority: RequestPriority = 1,
): Promise<T | undefined> {
    if (!isCurrent()) return undefined;
    const background = await new Promise<boolean>(resolve => {
        waiting.push({ start: resolve, priority });
        drain();
    });

    try {
        // A newer query may have superseded this call while it was queued.
        return isCurrent() ? await search() : undefined;
    } finally {
        active -= 1;
        if (background) backgroundActive--;
        drain();
    }
}
