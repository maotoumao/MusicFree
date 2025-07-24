import { useAppConfig } from "@/core/appConfig";
import Theme from "@/core/theme";
import useCheckUpdate from "@/hooks/useCheckUpdate";
import { useListenOrientationChange } from "@/hooks/useOrientation";
import { getDefaultStore, useAtomValue } from "jotai";
import { useEffect } from "react";
import { AppState, NativeEventSubscription, useColorScheme } from "react-native";
import bootstrapAtom from "./bootstrap.atom";
import { initTrackPlayer } from "./bootstrap";
import { showDialog } from "@/components/dialogs/useDialog";
import i18n from "@/core/i18n";

export function BootstrapComponent() {
    const bootstrapState = useAtomValue(bootstrapAtom);

    useListenOrientationChange();
    useCheckUpdate();

    const followSystem = useAppConfig("theme.followSystem");

    const colorScheme = useColorScheme();

    useEffect(() => {
        if (followSystem) {
            if (colorScheme === "dark") {
                Theme.setTheme("p-dark");
            } else if (colorScheme === "light") {
                Theme.setTheme("p-light");
            }
        }
    }, [colorScheme, followSystem]);

    useEffect(() => {
        let appStateEventSubscription: NativeEventSubscription | null = null;

        const reinitializeTrackPlayerWithDialog = () => {
            showDialog("LoadingDialog", {
                title: i18n.t("dialog.loading.reinitializeTrackPlayer"), 
                promise: initTrackPlayer(),
                onResolve(data, hideDialog) {
                    hideDialog();
                },
                onReject(reason, hideDialog) {
                    hideDialog();
                },
            });
        };

        if (bootstrapState.state === "TrackPlayerError") {
            if (AppState.currentState === "active") {
                reinitializeTrackPlayerWithDialog();
            } else {
                appStateEventSubscription = AppState.addEventListener("change", (nextState) => {
                    if (nextState === "active" && getDefaultStore().get(bootstrapAtom).state === "TrackPlayerError") {
                        reinitializeTrackPlayerWithDialog();
                    }
                });
            }
        }

        return () => {
            if (appStateEventSubscription) {
                appStateEventSubscription.remove();
            }
        };
    }, [bootstrapState]);

    return null;
}
