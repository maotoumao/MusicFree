import { buildLyricSearchVariants } from "../lyricSearchQuery";

describe("buildLyricSearchVariants", () => {
    test("序号 + 作者 - 歌名", () => {
        const { queries, targetTitle } = buildLyricSearchVariants(
            "11.11 伍佰 - 梦醒时分",
        );
        expect(targetTitle).toBe("梦醒时分");
        expect(queries).toContain("11.11 伍佰 - 梦醒时分");
        expect(queries).toContain("伍佰 - 梦醒时分");
        expect(queries).toContain("梦醒时分");
        expect(queries).toContain("梦醒时分 伍佰");
        expect(queries[0]).toBe("11.11 伍佰 - 梦醒时分");
    });

    test("序号 + 空格 + 作者 - 歌名", () => {
        const { queries, targetTitle } = buildLyricSearchVariants(
            "01 伍佰 - 突然的自我",
        );
        expect(targetTitle).toBe("突然的自我");
        expect(queries).toContain("伍佰 - 突然的自我");
        expect(queries).toContain("突然的自我");
    });

    test("序号 + 点号分隔 (无横杠)", () => {
        const { queries, targetTitle } = buildLyricSearchVariants("01. 晴天");
        expect(targetTitle).toBe("晴天");
        expect(queries).toContain("晴天");
        expect(queries[0]).toBe("01. 晴天");
    });

    test("顿号分隔序号", () => {
        const { targetTitle } = buildLyricSearchVariants("1、突然的自我");
        expect(targetTitle).toBe("突然的自我");
    });

    test("纯歌名不误伤 (数字开头的歌名)", () => {
        const { queries, targetTitle } = buildLyricSearchVariants("7 rings");
        expect(targetTitle).toBe("7 rings");
        expect(queries).toEqual(["7 rings"]);
    });

    test("纯歌名无序号", () => {
        const { queries, targetTitle } = buildLyricSearchVariants("梦醒时分");
        expect(targetTitle).toBe("梦醒时分");
        expect(queries).toEqual(["梦醒时分"]);
    });

    test("多段横杠", () => {
        const { queries, targetTitle } = buildLyricSearchVariants(
            "03 周杰伦 - 晴天 - Live",
        );
        // 歌名本身含横杠: 除首段(作者)外的段整体视为歌名
        expect(targetTitle).toBe("晴天 - Live");
        expect(queries).toContain("周杰伦");
        expect(queries).toContain("晴天");
        expect(queries).toContain("晴天 - Live");
        expect(queries).toContain("晴天 - Live 周杰伦");
    });
});
