import BackgroundTimer from 'react-native-background-timer';

export default function (millsecond: number) {
    return new Promise<void>(resolve => {
        BackgroundTimer.setTimeout(() => {
            resolve();
        }, millsecond);
    });
}
