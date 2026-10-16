import { beforeEach, expect, it } from "@jest/globals";
import { RecommendationSettings } from "./settings";

const values = new Map<string, string>();
const settings = new RecommendationSettings({
    getString: key => values.get(key),
    set: (key, value) => {
        values.set(key, value);
    },
    delete: key => {
        values.delete(key);
    },
});
beforeEach(() => values.clear());
it("does not opt users in when configuration is missing, malformed or lacks consent", () => {
    for (const value of [undefined, "bad json", JSON.stringify({ apiKey: "a".repeat(32) }), JSON.stringify({ enabled: true, apiKey: 123 })]) {
        values.clear();
        if (value) values.set("lastfm", value);
        expect(settings.read()).toEqual({ enabled: false, apiKey: "" });
    }
});
it("requires a valid user-supplied key and removes it when disabled", () => {
    expect(() => settings.enable("invalid")).toThrow();
    settings.enable("a".repeat(32));
    expect(settings.read()).toEqual({ enabled: true, apiKey: "a".repeat(32) });
    settings.disable();
    expect(values.has("lastfm")).toBe(false);
    expect(settings.read().enabled).toBe(false);
});
