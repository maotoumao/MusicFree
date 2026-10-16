export type SourceTier = "preferred" | "backup" | "disabled";
export interface SourceProfile {
    sourceId: string; displayName: string; score: number | null; tier: SourceTier;
    verifiedOnAndroid: boolean; requiresAndroidCheck?: boolean; previewOnly?: boolean; reason: string;
}
export interface SourceOverride { tier?: SourceTier; verifiedOnAndroid?: boolean }
export function sourceProfile(
    sourceId: string, name: string, catalog: SourceProfile[], override?: SourceOverride, expired = false,
): SourceProfile {
    const found = catalog.find(s => s.sourceId === sourceId);
    const result: SourceProfile = found ? { ...found } : {
        sourceId, displayName: name, score: null, tier: "backup", verifiedOnAndroid: false, reason: "unscored",
    };
    if (expired && result.tier === "disabled" && !result.previewOnly) {
        result.tier = "backup";
        result.reason = "needs-retest";
    }
    if (override) Object.assign(result, override, { reason: "manual-override" });
    if (result.previewOnly) result.tier = "disabled";
    if (result.requiresAndroidCheck && !result.verifiedOnAndroid && result.tier === "preferred") result.tier = "backup";
    return result;
}
