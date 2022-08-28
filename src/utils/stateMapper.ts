import {useEffect, useState} from 'react';

export default class StateMapper<T> {
  private getFun: () => T;
  private cbs: Set<Function> = new Set([]);
  constructor(getFun: () => T) {
    this.getFun = getFun;
  }

  notify = () => {
    this.cbs.forEach(_ => _?.());
  }

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
  }
}
