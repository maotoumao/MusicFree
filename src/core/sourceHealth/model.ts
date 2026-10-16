export type SourceOperation = "search" | "media";

export interface OperationStats {
    success: number;
    failure: number;
    avgLatencyMs: number;
    consecutiveFailures: number;
    lastSuccessAt?: number;
    lastFailureAt?: number;
}

export interface SourceHealthRecord {
    search: OperationStats;
    media: OperationStats;
    updatedAt: number;
}

export type SourceHealthStatus =
    | "untested"
    | "excellent"
    | "healthy"
    | "unstable"
    | "poor";

export interface SourceHealthSummary {
    score: number | null;
    status: SourceHealthStatus;
}

export function createOperationStats(): OperationStats {
    return {
        success: 0,
        failure: 0,
        avgLatencyMs: 0,
        consecutiveFailures: 0,
    };
}

export function createSourceHealthRecord(now = Date.now()): SourceHealthRecord {
    return {
        search: createOperationStats(),
        media: createOperationStats(),
        updatedAt: now,
    };
}

export function updateOperationStats(
    current: OperationStats,
    success: boolean,
    latencyMs: number,
    now = Date.now(),
): OperationStats {
    const previousCount = current.success + current.failure;
    const latency = Number.isFinite(latencyMs) ? Math.max(0, latencyMs) : 0;
    const nextCount = previousCount + 1;
    const avgLatencyMs =
        (current.avgLatencyMs * previousCount + latency) / nextCount;    return {
        success: current.success + (success ? 1 : 0),
        failure: current.failure + (success ? 0 : 1),
        avgLatencyMs,
        consecutiveFailures: success ? 0 : current.consecutiveFailures + 1,
        lastSuccessAt: success ? now : current.lastSuccessAt,
        lastFailureAt: success ? current.lastFailureAt : now,
    };
}

export function updateSourceHealthRecord(
    current: SourceHealthRecord | undefined,
    operation: SourceOperation,
    success: boolean,
    latencyMs: number,
    now = Date.now(),
): SourceHealthRecord {
    const base = current ?? createSourceHealthRecord(now);
    return {
        ...base,
        [operation]: updateOperationStats(
            base[operation],
            success,
            latencyMs,
            now,
        ),
        updatedAt: now,
    };
}

function sampleCount(stats: OperationStats) {
    return stats.success + stats.failure;
}function bayesianSuccessRate(stats: OperationStats) {
    const total = sampleCount(stats);
    // Prior: 50% success with four virtual observations.
    return (stats.success + 2) / (total + 4);
}

function getLatencyScore(record: SourceHealthRecord) {
    const groups = [record.search, record.media].filter(
        stats => sampleCount(stats) > 0,
    );
    const totalSamples = groups.reduce((sum, stats) => sum + sampleCount(stats), 0);
    if (!totalSamples) {
        return 0.5;
    }

    const averageLatency =
        groups.reduce(
            (sum, stats) => sum + stats.avgLatencyMs * sampleCount(stats),
            0,
        ) / totalSamples;

    if (averageLatency <= 500) return 1;
    if (averageLatency <= 1000) return 0.9;
    if (averageLatency <= 2000) return 0.75;
    if (averageLatency <= 4000) return 0.5;
    if (averageLatency <= 8000) return 0.25;
    return 0.1;
}

export function getSourceHealthStatus(score: number | null): SourceHealthStatus {
    if (score == null) return "untested";
    if (score >= 90) return "excellent";
    if (score >= 70) return "healthy";
    if (score >= 40) return "unstable";
    return "poor";
}

export function calculateSourceHealth(
    record: SourceHealthRecord | undefined,
): SourceHealthSummary {
    if (!record || sampleCount(record.search) + sampleCount(record.media) === 0) {
        return { score: null, status: "untested" };
    }

    const weightedReliability = [
        { stats: record.media, weight: 0.7 },
        { stats: record.search, weight: 0.3 },
    ].filter(item => sampleCount(item.stats) > 0);

    const weightTotal = weightedReliability.reduce(
        (sum, item) => sum + item.weight,
        0,
    );
    const reliability =
        weightedReliability.reduce(
            (sum, item) => sum + bayesianSuccessRate(item.stats) * item.weight,
            0,
        ) / weightTotal;

    const worstFailureStreak = Math.max(
        record.search.consecutiveFailures,
        record.media.consecutiveFailures,
    );
    const failurePenalty = Math.min(worstFailureStreak * 2.5, 10);

    const rawScore =
        reliability * 90 + getLatencyScore(record) * 10 - failurePenalty;
    const score = Math.max(0, Math.min(100, Math.round(rawScore)));

    return {
        score,
        status: getSourceHealthStatus(score),
    };
}
