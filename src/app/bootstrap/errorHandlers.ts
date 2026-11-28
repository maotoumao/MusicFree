/**
 * 未捕获异常的兜底
 *
 * 与 `ErrorBoundary` 分工不同：这里接的是异步 / 事件回调里的异常，此时 React 树
 * 往往好好的、用户正在正常听歌——只记录错误，不额外弹出通用提示。
 * 整屏错误页留给渲染期崩溃，那时子树确实已经废了。
 */
import { errorLog } from '@/core/errorLog';

import type { ErrorSource } from '@/core/errorLog';

/** Hermes 的 rejection tracker 接口；RN 未导出类型，按实际调用形状声明 */
interface HermesWithRejectionTracker {
    enablePromiseRejectionTracker?(options: {
        allRejections: boolean;
        onUnhandled(id: number, rejection: unknown): void;
        onHandled?(id: number): void;
    }): void;
}

/**
 * 安装全局处理器
 *
 * 必须在 container 装配之后调（那时 `errorLog` 才换成真实现；装配前是内存替身）。
 * 更早的模块求值期异常本就不是 JS 处理器能接住的，接受这个边界。
 */
export function installErrorHandlers(): void {
    installUncaughtHandler();
    installRejectionTracker();
}

function record(source: ErrorSource, error: unknown): void {
    try {
        errorLog.capture({ source, error });
    } catch {
        // 兜底自己不能再抛
    }
}

function installUncaughtHandler(): void {
    const previous = ErrorUtils.getGlobalHandler();
    ErrorUtils.setGlobalHandler((error, isFatal) => {
        record('uncaught', error);
        // 交回原处理器：dev 下的红屏、release 下的默认行为都还要照常发生
        previous?.(error, isFatal);
    });
}

/**
 * 未处理的 Promise rejection
 *
 * `ErrorUtils` 接不到它——RN 走的是另一条路：`polyfillPromise.js` 只在 `__DEV__`
 * 下调 `enablePromiseRejectionTracker`，且回调直接进 `ExceptionsManager`。
 * 于是 **release 下这类错误完全静默**，而插件是第三方异步代码、恰恰最容易漏掉
 * `await` 或抛出 detached rejection。
 *
 * 故只在非 dev 装自己的 tracker：dev 留给 RN 的红屏，别把它顶掉。
 */
function installRejectionTracker(): void {
    if (__DEV__) {
        return;
    }
    const hermes = (
        globalThis as { HermesInternal?: HermesWithRejectionTracker }
    ).HermesInternal;
    hermes?.enablePromiseRejectionTracker?.({
        allRejections: true,
        onUnhandled: (_id, rejection) => {
            record('uncaught', rejection);
        },
    });
}
