import NativeTimer from '@/native/specs/NativeTimer';

/** delay 选项 */
export interface DelayOptions {
    /** 需要后台仍可靠执行（进程存活期间）→ 走原生 timer；缺省 false 走 JS setTimeout */
    runInBackground?: boolean;
    /** 取消信号；abort 时 promise reject 一个 name==='AbortError' 的 Error */
    signal?: AbortSignal;
}

/** abort 的 reject 值：Hermes 不一定有 DOMException，故用普通 Error 打 name */
function abortError(): Error {
    const error = new Error('Aborted');
    error.name = 'AbortError';
    return error;
}

/* 原生路径的 id↔resolver 编织：id 由 JS 分配，一次性订阅 onTimerFire 按 id 派发（迟到事件查不到即 no-op） */
let nextId = 1;
const resolvers = new Map<number, () => void>();

NativeTimer.onTimerFire(({ id }) => {
    const resolve = resolvers.get(id);
    if (resolve) {
        resolvers.delete(id);
        resolve();
    }
});

/**
 * 延时 Promise。runInBackground=true 走 NativeTimer（原生 Looper/GCD 驱动，进程存活期间后台也触发，
 * 不穿透进程死亡）；否则走 JS setTimeout（前台）。仅 signal.abort() 会 reject（AbortError）、到点 resolve
 */
export function delay(ms: number, opts?: DelayOptions): Promise<void> {
    const { runInBackground = false, signal } = opts ?? {};
    if (signal?.aborted) {
        return Promise.reject(abortError());
    }
    // 净化非法 ms（NaN/Inf/负）→ 0 立即触发，避免传到原生 int64 转换未定义
    const wait = Number.isFinite(ms) && ms > 0 ? ms : 0;

    if (!runInBackground) {
        return new Promise<void>((resolve, reject) => {
            let handle: ReturnType<typeof setTimeout>;
            const onAbort = () => {
                clearTimeout(handle);
                reject(abortError());
            };
            handle = setTimeout(() => {
                signal?.removeEventListener('abort', onAbort);
                resolve();
            }, wait);
            signal?.addEventListener('abort', onAbort, { once: true });
        });
    }

    return new Promise<void>((resolve, reject) => {
        const id = nextId++;
        const onAbort = () => {
            if (resolvers.delete(id)) {
                NativeTimer.clearTimeout(id);
            }
            reject(abortError());
        };
        resolvers.set(id, () => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        });
        signal?.addEventListener('abort', onAbort, { once: true });
        NativeTimer.setTimeout(id, wait);
    });
}

/**
 * withTimeout 超时时抛出的错误：用类型而不是 message 辨认——被套的 Promise 来自第三方（插件）时，
 * 对方自己 `reject(new Error('timeout'))` 是常见写法，按字符串判会把它误认成我们的超时
 */
export class TimeoutError extends Error {
    constructor() {
        super('timeout');
        this.name = 'TimeoutError';
    }
}

/**
 * 给 Promise 套后台可靠的超时；超时 reject `TimeoutError`
 * 原 Promise 无法被取消，调用方须自行忽略它的迟到结果；任一方先结算后都会撤掉计时器
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    const controller = new AbortController();
    return Promise.race([
        promise,
        delay(ms, {
            runInBackground: true,
            signal: controller.signal,
        }).then(() => {
            throw new TimeoutError();
        }),
    ]).finally(() => controller.abort());
}
