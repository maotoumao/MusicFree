import { describe, expect, it, jest } from "@jest/globals";

jest.mock("react-native-reanimated", () => ({
    Easing: { linear: (t: number) => t, out: (fn: any) => fn, exp: (t: number) => t },
}));
jest.mock("react-native-fs", () => ({
    __esModule: true,
    default: {
        CachesDirectoryPath: "/tmp/caches",
        DocumentDirectoryPath: "/tmp/docs",
        ExternalDirectoryPath: "/tmp/ext",
    },
    CachesDirectoryPath: "/tmp/caches",
    DocumentDirectoryPath: "/tmp/docs",
    ExternalDirectoryPath: "/tmp/ext",
    readDir: jest.fn(async () => []),
    readFile: jest.fn(async () => ""),
    writeFile: jest.fn(async () => undefined),
    unlink: jest.fn(async () => undefined),
    exists: jest.fn(async () => false),
    stat: jest.fn(async () => ({})),
}));
jest.mock("expo-file-system", () => ({ readAsStringAsync: jest.fn(async () => "") }));
jest.mock("@/core/mediaCache", () => ({ __esModule: true, default: {} }));
jest.mock("nanoid", () => ({ nanoid: () => "test-id" }));
jest.mock("react-native-background-timer", () => ({
    __esModule: true,
    default: { setTimeout, clearTimeout },
}));
jest.mock("@react-native-async-storage/async-storage", () =>
    require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("react-native-device-info", () => ({
    __esModule: true,
    default: { getVersion: () => "0.6.2", getBuildNumber: () => "1" },
}));
jest.mock("react-native-url-polyfill", () => ({ URL }));
jest.mock("webdav", () => ({}));
jest.mock("@react-native-community/netinfo", () => ({
    __esModule: true,
    default: { addEventListener: () => () => undefined, fetch: async () => ({}) },
}));

import axios from "axios";
import "../plugin";

describe("插件请求超时配置", () => {
    it("全局超时为 10s", () => {
        expect(axios.defaults.timeout).toBe(10000);
    });
});
