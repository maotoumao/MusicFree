import { useRef, useState } from "react";

export default function useDelayFalse(init = false , ms: number = 0) {
    const [_state, _setState] = useState(init);
    const timer = useRef<any>();

    function setState(st: boolean){
        if(st === true) {
            timer.current && clearTimeout(timer.current);
            timer.current = undefined;
            _setState(true);
        }
        if(st === false) {
            timer.current = setTimeout(() => {
                _setState(false);
                timer.current = undefined;
            }, ms);
        }
    }

    return [_state, setState] as ReturnType<typeof useState<boolean>>
}