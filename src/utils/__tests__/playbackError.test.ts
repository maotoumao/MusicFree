/**
 * PlaybackError 事件字段兼容性验证。
 * 覆盖 PR: fix(trackPlayer): 兼容 iOS 播放错误事件
 */
import { describe, expect, it } from "@jest/globals";
import { getPlaybackErrorMessage } from "../playbackError";

describe("getPlaybackErrorMessage", () => {
    it("Android 事件使用 message", () => {
        expect(
            getPlaybackErrorMessage({
                message: "Source error",
                code: "android-io-bad-http-status",
            }),
        ).toBe("Source error");
    });

    it("iOS 事件只有 error 字段时也能取到文案", () => {
        expect(
            getPlaybackErrorMessage({ error: "The operation couldn’t be completed." }),
        ).toBe("The operation couldn’t be completed.");
    });

    it("message 为空字符串时回退到 error", () => {
        expect(getPlaybackErrorMessage({ message: "", error: "ios-error" })).toBe(
            "ios-error",
        );
    });

    it("都为空时返回空字符串，避免误触发自动跳曲", () => {
        expect(getPlaybackErrorMessage({})).toBe("");
        expect(getPlaybackErrorMessage(null)).toBe("");
        expect(getPlaybackErrorMessage(undefined)).toBe("");
    });
});
