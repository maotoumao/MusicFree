import React from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it, jest } from "@jest/globals";
import { usePreparedRecommendations } from "./usePreparedRecommendations";
import { warmRecommendations } from "../aggregateSearch/preloader";

let mockPlugins: any[] = [];
jest.mock("../pluginManager", () => ({ usePlugins: () => mockPlugins }));
jest.mock("../appConfig", () => ({ getConfig: () => true }));
jest.mock("@/utils/network", () => ({ isOffline: false, isCellular: false }));
jest.mock("@react-navigation/native", () => ({ useFocusEffect: (callback: () => any) => require("react").useEffect(callback, [callback]) }));
jest.mock("../aggregateSearch/preloader", () => ({ warmRecommendations: jest.fn() }));

describe("startup recommendation preparation", () => {
    it("waits for plugins before validating cached links and starts as soon as they are loaded", () => {
        const stop = jest.fn();
        jest.mocked(warmRecommendations).mockReturnValue({ stop, prioritize: jest.fn() });
        function Screen() {
            usePreparedRecommendations([{ artist: "Artist", title: "Song" }]);
            return null;
        }
        let screen!: ReturnType<typeof create>;
        act(() => {
            screen = create(<Screen />);
        });
        expect(warmRecommendations).not.toHaveBeenCalled();
        mockPlugins = [{ hash: "source" }];
        act(() => {
            screen.update(<Screen />);
        });
        expect(warmRecommendations).toHaveBeenCalledTimes(1);
        act(() => {
            screen.unmount();
        });
        expect(stop).toHaveBeenCalledTimes(1);
    });
});
