/**
 * 本地音乐导入路径归一化 / 去重验证。
 * 覆盖 PR: feat(localMusic): 支持直接选择单个音频文件
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("react-native-reanimated", () => ({
    Easing: { linear: (t: number) => t, out: (fn: any) => fn, exp: (t: number) => t },
}));
jest.mock("nanoid", () => ({ nanoid: () => "test-id" }));
jest.mock("react-native-fs", () => ({
    readDir: jest.fn(),
    stat: jest.fn(),
    exists: jest.fn(async () => true),
    unlink: jest.fn(),
}));

jest.mock("@/native/mp3Util", () => ({
    __esModule: true,
    default: {
        getMediaMeta: jest.fn(async (paths: string[]) =>
            paths.map(() => ({ title: "t", artist: "a", album: "al", duration: "8000" })),
        ),
    },
}));

jest.mock("@/utils/storage", () => ({
    getStorage: jest.fn(async () => []),
    setStorage: jest.fn(async () => undefined),
}));

import { readDir, stat } from "react-native-fs";
import { setStorage } from "@/utils/storage";
import LocalMusicSheet, { isLocalMediaFile } from "../localMusicSheet";

const importLocal = LocalMusicSheet.importLocal;

const readDirMock = readDir as unknown as jest.Mock<
    (path: string) => Promise<any[]>
>;
const statMock = stat as unknown as jest.Mock<(path: string) => Promise<any>>;
const setStorageMock = setStorage as unknown as jest.Mock<
    (key: string, value: any) => Promise<void>
>;

const FILE = "/storage/emulated/0/TestMusic/single_track.wav";

function lastSheet(): any[] {
    const calls = setStorageMock.mock.calls.filter(([key]) => key === "local-music-sheet");
    return calls.length ? calls[calls.length - 1][1] : [];
}

beforeEach(() => {
    jest.clearAllMocks();
    statMock.mockResolvedValue({ isFile: () => true, isDirectory: () => false });
    readDirMock.mockResolvedValue([
        { path: FILE, isFile: () => true, isDirectory: () => false },
    ]);
});

describe("isLocalMediaFile", () => {
    it("识别受支持的音频后缀（大小写不敏感）", () => {
        expect(isLocalMediaFile("/a/b/song.mp3")).toBe(true);
        expect(isLocalMediaFile("/a/b/song.FLAC")).toBe(true);
        expect(isLocalMediaFile("file:///a/b/song.m4a")).toBe(true);
    });

    it("拒绝非音频文件", () => {
        expect(isLocalMediaFile("/a/b/cover.jpg")).toBe(false);
        expect(isLocalMediaFile("/a/b/readme.txt")).toBe(false);
        expect(isLocalMediaFile("/a/b/song.mp3.bak")).toBe(false);
    });
});

describe("importLocal", () => {
    it("可以直接导入单个音频文件", async () => {
        await importLocal([FILE]);
        const sheet = lastSheet();
        expect(sheet).toHaveLength(1);
        expect(sheet[0].platform).toBe("本地");
        expect(sheet[0].$?.localPath).toBe(FILE);
    });

    it("同一个文件用 file:// 导入时与绝对路径生成相同 id", async () => {
        await importLocal([FILE]);
        const absoluteId = lastSheet()[0].id;

        await importLocal([`file://${FILE}`]);
        const fileSchemeId = lastSheet()[0].id;
        // 第二次导入时本地歌单已有该项，不应重复
        expect(lastSheet()).toHaveLength(1);
        expect(fileSchemeId).toBe(absoluteId);
    });

    it("文件夹递归导入仍然有效", async () => {
        await importLocal(["/storage/emulated/0/TestMusic"]);
        const sheet = lastSheet();
        expect(sheet).toHaveLength(1);
        expect(sheet[0].$?.localPath).toBe(FILE);
    });

    it("同时选中文件与其所在文件夹不会重复导入", async () => {
        await importLocal([FILE, "/storage/emulated/0/TestMusic"]);
        expect(lastSheet()).toHaveLength(1);
        expect(setStorageMock).toHaveBeenCalled();
    });
});
