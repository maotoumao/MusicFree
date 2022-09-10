export default function (millsecond: number) {
    return new Promise<void>(resolve => {
        setTimeout(() => {
            resolve();
        }, millsecond);
    });
}
