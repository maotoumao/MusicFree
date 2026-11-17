import { describe, expect, it } from "@jest/globals";
import { isLocalVersionNotOlder, normalizeBackupPayload } from "../backupPayload";

const v2Envelope = {
    format: "musicfree-backup",
    version: 2,
    origin: { platform: "android", appVersion: "1.0.0-beta.4" },
    sections: {
        musicSheets: [
            { id: "favorite", title: "", musicList: [{ id: "1", platform: "QQ音乐" }] },
        ],
        starredPlaylists: [{ id: "qq~pl~1" }],
        plugins: {
            installed: [
                { srcUrl: "https://example.com/qq.js", version: "1.9.23", enabled: true },
            ],
            subscriptions: [{ name: "lukaizj", url: "https://example.com/plugins.json" }],
            alternatives: [],
        },
        settings: { values: {} },
    },
};

describe("normalizeBackupPayload", () => {
    it("认出 v1 扁平格式", () => {
        const flat = {
            musicSheets: [{ id: "favorite", musicList: [] }],
            plugins: [{ srcUrl: "https://example.com/a.js", version: "1.0.0" }],
        };

        const payload = normalizeBackupPayload(flat);

        expect(payload.musicSheets).toHaveLength(1);
        expect(payload.plugins).toEqual(flat.plugins);
    });

    it("认出 v2 信封：正文取 sections，插件取 installed", () => {
        const payload = normalizeBackupPayload(v2Envelope);

        expect(payload.musicSheets).toHaveLength(1);
        expect(payload.plugins).toEqual([
            { srcUrl: "https://example.com/qq.js", version: "1.9.23", enabled: true },
        ]);
        /** platform 原样透传：认出别名是取源时的事，恢复这一步不改写数据 */
        expect((payload.musicSheets[0] as any).musicList[0].platform).toBe("QQ音乐");
    });

    it("字符串入参先解析再归一化", () => {
        const payload = normalizeBackupPayload(JSON.stringify(v2Envelope));

        expect(payload.musicSheets[0].id).toBe("favorite");
    });

    it("空备份是合法的，不该报错", () => {
        expect(normalizeBackupPayload({ musicSheets: [], plugins: [] })).toEqual({
            musicSheets: [],
            plugins: [],
        });
    });

    it("不是 JSON 时说明是格式问题", () => {
        expect(() => normalizeBackupPayload("<html>502</html>")).toThrow(
            "备份文件格式无效",
        );
    });

    it("认不出的结构要说清缺了什么", () => {
        expect(() => normalizeBackupPayload({ foo: 1 })).toThrow(
            "无法识别的备份文件",
        );
        expect(() => normalizeBackupPayload({ sections: null })).toThrow(
            "无法识别的备份文件",
        );
    });

    it("丢掉没有 srcUrl 的条目：本地文件安装的插件无法按链接恢复", () => {
        const payload = normalizeBackupPayload({
            musicSheets: [],
            plugins: [
                { srcUrl: "https://example.com/a.js" },
                { version: "1.0.0" },
                null,
                "https://example.com/b.js",
            ],
        });

        expect(payload.plugins).toHaveLength(1);
    });

    it("plugins 是对象但没有 installed 时按没有插件处理", () => {
        const payload = normalizeBackupPayload({
            musicSheets: [{ id: "favorite" }],
            plugins: { subscriptions: [] },
        });

        expect(payload.plugins).toEqual([]);
    });
});

describe("isLocalVersionNotOlder", () => {
    it.each([
        ["本地更高", "2.0.0", "1.9.23", true],
        ["版本相同", "1.9.23", "1.9.23", true],
        ["本地更低", "1.9.22", "1.9.23", false],
    ])("%s", (_title, local, backup, expected) => {
        expect(isLocalVersionNotOlder(local, backup)).toBe(expected);
    });

    it("空串版本不抛异常：本地导入的插件常常没有版本号", () => {
        expect(isLocalVersionNotOlder("", "1.9.23")).toBe(false);
        expect(isLocalVersionNotOlder("1.9.23", "")).toBe(true);
    });

    it("非法版本号不抛异常且不跳过安装", () => {
        expect(isLocalVersionNotOlder("1.9", "1.9.23")).toBe(false);
        expect(isLocalVersionNotOlder(undefined, undefined)).toBe(false);
    });
});
