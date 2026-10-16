export const SearchConfig = {
    concurrency: 4,
    sourceTimeoutMs: 10000,
    searchCacheMs: 5 * 60000,
    resolverTimeoutMs: 12000,
    resolvedCacheMs: 7 * 86400000,
    maxCandidatesPerTier: 12,
    preparedSourceMs: 5 * 60000,
    preparedRefreshAheadMs: 60000,
    backgroundConcurrency: 2,
    backgroundPrepareMs: 45000,
    cachedStartTimeoutMs: 4000,
    startTimeoutMs: 8000,
} as const;

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Source timed out")), ms);
        promise.then(value => {
            clearTimeout(timer); resolve(value);
        }, error => {
            clearTimeout(timer); reject(error);
        });
    });
}
