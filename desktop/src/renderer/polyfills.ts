/**
 * 桌面端渲染进程全局补丁
 * 必须在应用代码之前执行。
 */

// RN 全局对象
(window as any).global = window;

// ErrorUtils(RN 全局错误处理,bootstrap 中使用)
if (!(window as any).ErrorUtils) {
    (window as any).ErrorUtils = {
        setGlobalHandler: (fn: (error: any, isFatal?: boolean) => void) => {
            window.addEventListener("error", (e) => {
                fn?.(e.error ?? e.message, true);
            });
            window.addEventListener("unhandledrejection", (e: any) => {
                fn?.(e.reason, false);
            });
        },
        getGlobalHandler: () => null,
    };
}

// 性能计时器兼容
if (!(window as any).performanceNow) {
    // no-op,performance.now 原生可用
}

// 桌面环境标记
(window as any).__MUSICFREE_DESKTOP__ = (window as any).__MUSICFREE_DESKTOP__ ?? true;
