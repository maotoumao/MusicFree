import React from "react";

let mockEntryLoads = 0;
jest.mock("./index", () => {
    mockEntryLoads++;
    return { __esModule: true, default: "MusicFreePages" };
});

it("registers a headless-safe root and loads the UI bootstrap only when rendered", () => {
    const NativeRoot = require("./nativeRoot").default;
    expect(mockEntryLoads).toBe(0);
    const element = NativeRoot();
    expect(mockEntryLoads).toBe(1);
    expect(React.isValidElement(element)).toBe(true);
    expect(element.type).toBe("MusicFreePages");
});
