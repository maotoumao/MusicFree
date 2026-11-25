/**
 * 搜索页插件 tab 收回逻辑验证。
 * 覆盖 PR: fix(search): 插件安装或卸载后刷新搜索 tab
 */
import { describe, expect, it } from "@jest/globals";
import { clampTabIndex } from "../tabIndex";

describe("clampTabIndex", () => {
    it("当前选中 tab 仍存在时不做调整", () => {
        expect(clampTabIndex(0, 3)).toBeNull();
        expect(clampTabIndex(2, 3)).toBeNull();
    });

    it("卸载最后一个插件后收回到新的最后一个 tab", () => {
        expect(clampTabIndex(2, 2)).toBe(1);
        expect(clampTabIndex(1, 1)).toBe(0);
    });

    it("没有可用 tab 时不返回索引，交给 Empty 状态处理", () => {
        expect(clampTabIndex(0, 0)).toBeNull();
    });
});
