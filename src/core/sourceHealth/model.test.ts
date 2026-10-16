import { describe, expect, it } from "@jest/globals";
import {
    calculateSourceHealth,
    createSourceHealthRecord,
    updateSourceHealthRecord,
} from "./model";

describe("source health model", () => {
    it("reports untested before any observations", () => {
        expect(calculateSourceHealth(undefined)).toEqual({
            score: null,
            status: "untested",
        });
    });

    it("does not give a single success a perfect score", () => {
        const record = updateSourceHealthRecord(
            undefined,
            "search",
            true,
            300,
            1000,
        );
        const summary = calculateSourceHealth(record);
        expect(summary.score).not.toBeNull();
        expect(summary.score!).toBeLessThan(100);
        expect(record.search.success).toBe(1);
        expect(record.search.failure).toBe(0);
    });    it("tracks latency and resets the failure streak after success", () => {
        let record = createSourceHealthRecord(0);
        record = updateSourceHealthRecord(record, "media", false, 1000, 1000);
        record = updateSourceHealthRecord(record, "media", false, 3000, 2000);
        expect(record.media.consecutiveFailures).toBe(2);
        expect(record.media.avgLatencyMs).toBe(2000);

        record = updateSourceHealthRecord(record, "media", true, 500, 3000);
        expect(record.media.consecutiveFailures).toBe(0);
        expect(record.media.success).toBe(1);
        expect(record.media.failure).toBe(2);
        expect(record.media.lastSuccessAt).toBe(3000);
        expect(record.media.lastFailureAt).toBe(2000);
    });

    it("weights media reliability more heavily than search reliability", () => {
        let mediaFailure = createSourceHealthRecord(0);
        let searchFailure = createSourceHealthRecord(0);

        for (let i = 0; i < 10; i += 1) {
            mediaFailure = updateSourceHealthRecord(
                mediaFailure,
                "search",
                true,
                500,
                i,
            );            searchFailure = updateSourceHealthRecord(
                searchFailure,
                "media",
                true,
                500,
                i,
            );
        }

        mediaFailure = updateSourceHealthRecord(
            mediaFailure,
            "media",
            false,
            500,
            20,
        );
        searchFailure = updateSourceHealthRecord(
            searchFailure,
            "search",
            false,
            500,
            20,
        );

        const mediaFailureScore = calculateSourceHealth(mediaFailure).score!;
        const searchFailureScore = calculateSourceHealth(searchFailure).score!;
        expect(mediaFailureScore).toBeLessThan(searchFailureScore);
    });
});
