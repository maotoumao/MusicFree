import { useEffect, useState } from "react";

export default class StateMapper<T> {
    private getFun: () => T;
    private cbs: Set<Function> = new Set([]);
    constructor(getFun: () => T) {
        this.getFun = getFun;
    }

    notify = () => {
        this.cbs.forEach(_ => _?.());
    };

    useMappedState = () => {
        const [_state, _setState] = useState<T>(this.getFun);
        const updateState = () => {
            _setState(this.getFun());
        };
        useEffect(() => {
            this.cbs.add(updateState);
            return () => {
                this.cbs.delete(updateState);
            };
        }, []);
        return _state;
    };
}

type UpdateFunc<T> = (prev: T) => T;

export class GlobalState<T> {
    private value: T;
    private stateMapper: StateMapper<T>;

    constructor(initValue: T) {
        this.value = initValue;
        this.stateMapper = new StateMapper(this.getValue);
    }

    public getValue = () => {
        return this.value;
    };

    public useValue = () => {
        return this.stateMapper.useMappedState();
    };

    public setValue = (value: T | UpdateFunc<T>) => {
        let newValue: T;
        if (typeof value === "function") {
            newValue = (value as UpdateFunc<T>)(this.value);
        } else {
            newValue = value;
        }

        this.value = newValue;
        this.stateMapper.notify();
    };
}
