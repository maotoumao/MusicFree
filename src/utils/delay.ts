import BackgroundTimer from "react-native-background-timer";

export default function (millsecond: number, background = true) {
    return new Promise<void>(resolve => {
        if (background) {
            BackgroundTimer.setTimeout(resolve, millsecond);
        } else {
            setTimeout(resolve, millsecond);
        }
    });
}
