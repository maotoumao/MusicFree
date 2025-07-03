/**
 * 音质相关的所有工具代码
 */

export const qualityKeys: IMusic.IQualityKey[] = [
    "low",
    "standard",
    "high",
    "super",
];

export const qualityText = {
    low: "低音质",
    standard: "标准音质",
    high: "高音质",
    super: "超高音质",
};

/** 获取音质顺序 */
export function getQualityOrder(
    qualityKey: IMusic.IQualityKey,
    sort: "asc" | "desc",
) {
    const idx = qualityKeys.indexOf(qualityKey);
    const left = qualityKeys.slice(0, idx);
    const right = qualityKeys.slice(idx + 1);
    if (sort === "asc") {
        /** 优先高音质 */
        return [qualityKey, ...right, ...left.reverse()];
    } else {
        /** 优先低音质 */
        return [qualityKey, ...left.reverse(), ...right];
    }
}
