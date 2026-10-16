import { describe, expect, it } from "@jest/globals";
import type { Plugin } from "@/core/pluginManager";
import { searchSourcePage } from "./search";

describe("aggregate plugin calls", () => {
    it("runs at most four calls and retains successes around a failure", async () => {
        let active = 0;
        let maximum = 0;
        const plugins = Array.from({ length: 9 }, (_, index) => ({
            hash: String(index),
            methods: {
                search: async () => {
                    active += 1;
                    maximum = Math.max(maximum, active);
                    await new Promise(resolve => setTimeout(resolve, 1));
                    active -= 1;
                    if (index === 2) throw new Error("plugin failed");
                    return { isEnd: true, data: [{ id: String(index), platform: String(index) }] };
                },
            },
        })) as unknown as Plugin[];

        const pages = await searchSourcePage(plugins, "song", 1, "music");
        expect(maximum).toBe(4);
        expect(pages).toHaveLength(9);
        expect(pages[2].result).toBeUndefined();
        expect(pages.filter(page => page.result)).toHaveLength(8);
        expect(pages.map(page => page.plugin.hash)).toEqual(plugins.map(plugin => plugin.hash));
    });

    it("does not launch later batches after a search is superseded", async () => {
        let started = 0;
        let current = true;
        const plugins = Array.from({ length: 7 }, () => ({
            methods: {
                search: async () => {
                    started += 1;
                    current = false;
                    return { data: [] };
                },
            },
        })) as unknown as Plugin[];
        await searchSourcePage(plugins, "song", 1, "music", () => current);
        expect(started).toBeGreaterThan(0);
        expect(started).toBeLessThanOrEqual(4);
    });
});
