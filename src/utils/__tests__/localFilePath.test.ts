/**
 * 本地文件路径归一化验证。
 * 用于保证「单文件选择」与「文件夹扫描」对同一文件生成相同的 id。
 */
import { describe, expect, it, jest } from "@jest/globals";

jest.mock("@react-native-async-storage/async-storage", () =>
    require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("react-native-fs", () => ({
    CachesDirectoryPath: "/tmp/caches",
    DocumentDirectoryPath: "/tmp/docs",
    ExternalDirectoryPath: "/tmp/ext",
    readDir: jest.fn(async () => []),
    readFile: jest.fn(async () => ""),
    writeFile: jest.fn(async () => undefined),
    unlink: jest.fn(async () => undefined),
    exists: jest.fn(async () => false),
}));

import { addFileScheme, normalizeLocalFilePath } from "../fileUtils";

describe("normalizeLocalFilePath", () => {
    it("去掉 file:// 前缀", () => {
        expect(normalizeLocalFilePath("file:///storage/emulated/0/a.mp3")).toBe(
            "/storage/emulated/0/a.mp3",
        );
    });

    it("绝对路径保持不变", () => {
        expect(normalizeLocalFilePath("/storage/emulated/0/a.mp3")).toBe(
            "/storage/emulated/0/a.mp3",
        );
    });

    it("content:// 等非 file 协议不处理", () => {
        expect(normalizeLocalFilePath("content://media/external/audio/1")).toBe(
            "content://media/external/audio/1",
        );
    });

    it("归一化与播放用的 addFileScheme 互为逆操作", () => {
        const absolute = "/storage/emulated/0/Music/a.m4a";
        expect(normalizeLocalFilePath(addFileScheme(absolute))).toBe(absolute);
    });
});
