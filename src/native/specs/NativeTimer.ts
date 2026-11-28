import { TurboModuleRegistry, type TurboModule } from 'react-native';

import type { EventEmitter } from 'react-native/Libraries/Types/CodegenTypes';

/** onTimerFire payload：带回对应 id */
export interface TimerFireEvent {
    /** 与 setTimeout 传入的 id 对应 */
    id: number;
}

/**
 * 后台可靠计时桥：原生 Looper/GCD 驱动，绕开 RN 的 Choreographer 后台节流（JS setTimeout 后台不走）。
 * 语义：进程存活期间按 CPU 活跃时间计时触发；deep sleep 无 wakelock 时倒计时暂停、CPU 唤醒后继续
 * （播放时 ExoPlayer 持 wakelock 故准点）；进程被杀 → pending 随 JS runtime 一起丢失，不触发。
 * id 由 JS 侧分配、native 只作键回带；跨桥无法传函数，故走 id + 事件（方法参数名 timerId 避开 ObjC `id` 关键字，事件字段仍为 id）。
 * 调度/取消跨桥、不保证与 JS 调用严格同步——取消权威在 JS 封装（迟到事件按 id 查表 no-op），
 * 分钟级后台用途 jitter 可忽略；需精确/前台用 JS setTimeout 路径
 */
export interface Spec extends TurboModule {
    /** 安排一次性定时；到点 emit onTimerFire(id) */
    setTimeout(timerId: number, ms: number): void;
    /** 取消尚未触发的定时 */
    clearTimeout(timerId: number): void;
    /** 到点回调 */
    readonly onTimerFire: EventEmitter<TimerFireEvent>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeTimer');
