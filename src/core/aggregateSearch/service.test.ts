import { describe, expect, it, jest } from "@jest/globals";
import { targetBatches, searchTargetSources } from "./service";
import { selectedSources } from "../sourcePolicy/runtime";
import { searchSourcePage } from "./search";

jest.mock("../sourcePolicy/runtime", () => ({ selectedSources: jest.fn(), profileFor: async () => ({ tier: "preferred", score: 90 }) }));
jest.mock("../sourceHealth", () => ({ getSourceHealthSummary: () => ({}) }));
jest.mock("./search", () => ({ searchSourcePage: jest.fn() }));

describe("automatic source search streaming", () => {
    it("searches simplified provider keywords while matching the original recommendation identity", async () => {
        const plugin = { name: "source", hash: "source" } as any;
        jest.mocked(searchSourcePage).mockResolvedValue([{ plugin, result: { isEnd: true, data: [
            { id: "1", platform: "source", artist: "林俊杰", title: "江南", duration: 240 },
        ] } }] as any);
        const results = await searchTargetSources({ artist: "林俊傑", title: "江南" }, [plugin]);
        expect(results).toHaveLength(1);
        expect(jest.mocked(searchSourcePage).mock.calls.at(-1)?.[1]).toBe("林俊杰 江南");
    });
    it("yields a fast usable source without waiting for its slow peer", async () => {
        const plugins = [{ name: "slow", hash: "slow" }, { name: "fast", hash: "fast" }] as any;
        jest.mocked(selectedSources).mockResolvedValue(plugins);
        let finishSlow!: () => void;
        jest.mocked(searchSourcePage).mockImplementation(async (batch: any) => {
            const plugin = batch[0];
            if (plugin.name === "slow") await new Promise<void>(resolve => {
                finishSlow = resolve;
            });
            return [{ plugin, result: { isEnd: true, data: [{ id: plugin.name, platform: plugin.name,
                title: "Song", artist: "Artist", duration: 200 }] } }] as any;
        });
        const batches = targetBatches({ title: "Song", artist: "Artist" }, "preferred");
        const first = await batches.next();
        expect(first.value?.[0].platform).toBe("fast");
        await batches.return(undefined);
        finishSlow();
    });
});
