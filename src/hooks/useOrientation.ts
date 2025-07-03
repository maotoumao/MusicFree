import { atom, useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { Dimensions } from "react-native";

const orientationAtom = atom<"vertical" | "horizontal">("vertical");

export function useListenOrientationChange() {
    const setOrientationAtom = useSetAtom(orientationAtom);
    useEffect(() => {
        const windowSize = Dimensions.get("window");
        const { width, height } = windowSize;
        if (width < height) {
            setOrientationAtom("vertical");
        } else {
            setOrientationAtom("horizontal");
        }
        const subscription = Dimensions.addEventListener("change", e => {
            if (e.window.width < e.window.height) {
                setOrientationAtom("vertical");
            } else {
                setOrientationAtom("horizontal");
            }
        });

        return () => {
            subscription?.remove();
        };
    }, []);
}

export default function useOrientation() {
    return useAtomValue(orientationAtom);
}
