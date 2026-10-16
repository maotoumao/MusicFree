import { describe, expect, it } from "@jest/globals";
import { scheduleMusicSearch, reprioritizeMusicRequests } from "./requestQueue";

describe("shared music search queue", () => {
    it("leaves two foreground slots free even when background requests hang", async () => {
        const releases: Array<() => void> = [];
        const warmups = Array.from({ length: 4 }, () => scheduleMusicSearch(() => new Promise<void>(resolve => releases.push(resolve)), () => true, 0));
        await Promise.resolve();
        expect(releases).toHaveLength(2);
        expect(await scheduleMusicSearch(async () => "click", () => true, 2)).toBe("click");
        releases.splice(0).forEach(release => release());
        for (let i = 0; i < 8; i++) await Promise.resolve();
        releases.splice(0).forEach(release => release());
        await Promise.all(warmups);
    });
    it("promotes a queued warmup immediately when the song is tapped", async () => {
        const releases: Array<() => void> = [];
        const warmups = Array.from({ length: 2 }, () => scheduleMusicSearch(() => new Promise<void>(resolve => releases.push(resolve)), () => true, 0));
        let priority = 0;
        let called = false;
        const clicked = scheduleMusicSearch(async () => {
            called = true;
        }, () => true, () => priority);
        await Promise.resolve();
        expect(called).toBe(false);
        priority = 2;
        reprioritizeMusicRequests();
        await clicked;
        expect(called).toBe(true);
        releases.forEach(release => release());
        await Promise.all(warmups);
    });
    it("caps overlapping searches at four and releases slots after rejection", async () => {
        let active = 0;
        let maximum = 0;
        const calls = Array.from({ length: 12 }, (_, index) =>
            scheduleMusicSearch(async () => {
                active += 1;
                maximum = Math.max(maximum, active);
                await new Promise(resolve => setTimeout(resolve, index % 3));
                active -= 1;
                if (index === 2) throw new Error("source failure");
                return index;
            }),
        );
        const results = await Promise.allSettled(calls);
        expect(maximum).toBe(4);
        expect(active).toBe(0);
        expect(results.filter(result => result.status === "fulfilled")).toHaveLength(11);
        expect(results[11]).toEqual({ status: "fulfilled", value: 11 });
    });

    it("does not start obsolete requests that are still queued", async () => {
        const releases: Array<() => void> = [];
        const blocking = Array.from({ length: 4 }, () =>
            scheduleMusicSearch(() => new Promise<void>(resolve => releases.push(resolve))),
        );
        await Promise.resolve();
        let current = true;
        let called = false;
        const obsolete = scheduleMusicSearch(async () => {
            called = true;
        }, () => current);
        current = false;
        releases.forEach(release => release());
        await Promise.all([...blocking, obsolete]);
        expect(called).toBe(false);
        expect(await scheduleMusicSearch(async () => "next")).toBe("next");
    });
});
