import { useRef, useState } from "react";

export default function useDelayFalsy<T extends any = any>(
    init?: T,
    ms: number = 0,
) {
    const [_state, _setState] = useState<T | undefined>(init);
    const timer = useRef<any>();

    function setState(st: T) {
        if (st === undefined || st === null || st === false) {
            timer.current && clearTimeout(timer.current);
            timer.current = setTimeout(() => {
                _setState(st);
                timer.current = undefined;
            }, ms);
            return;
        }
        timer.current && clearTimeout(timer.current);
        timer.current = undefined;
        _setState(st);
    }

    return [_state, setState, _setState] as [
        ...ReturnType<typeof useState<T>>,
        ReturnType<typeof useState<T>>[1],
    ];
}
