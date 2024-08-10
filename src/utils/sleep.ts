/**
 * Sleep是用的settimeout，delay用的是backgroundtimer
 * @param ms
 */
export default function sleep(ms = 200) {
    return new Promise<void>(resolve => {
        setTimeout(() => {
            resolve();
        }, ms);
    });
}
