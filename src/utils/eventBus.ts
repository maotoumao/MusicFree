import EventEmitter from 'eventemitter3';

class EventBus<EventTypes> {
    private ee: EventEmitter;

    constructor() {
        this.ee = new EventEmitter();
    }

    /**
     * 监听
     * @param eventName 事件名
     * @param callBack 回调
     */
    on<T extends EventTypes, K extends keyof T & (string | symbol)>(
        eventName: K,
        callBack: (payload: T[K]) => void,
    ) {
        this.ee.on(eventName, callBack);
    }

    once<T extends EventTypes, K extends keyof T & (string | symbol)>(
        eventName: K,
        callBack: (payload: T[K]) => void,
    ) {
        this.ee.once(eventName, callBack);
    }

    emit<T extends EventTypes, K extends keyof T & (string | symbol)>(
        eventName: K,
        payload?: T[K],
    ) {
        this.ee.emit(eventName, payload);
    }

    off<T extends EventTypes, K extends keyof T & (string | symbol)>(
        eventName: K,
        callBack: (payload: T[K]) => void,
    ) {
        this.ee.off(eventName, callBack);
    }
}

export default EventBus;
