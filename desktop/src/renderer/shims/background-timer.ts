/**
 * react-native-background-timer 桌面端实现
 * Electron 渲染进程本身常驻,直接使用标准定时器。
 */

const BackgroundTimer = {
    setTimeout(fn: (...args: any[]) => void, ms?: number, ...args: any[]): number {
        return window.setTimeout(fn, ms, ...args) as unknown as number;
    },

    clearTimeout(id: number): void {
        window.clearTimeout(id as any);
    },

    setInterval(fn: (...args: any[]) => void, ms?: number, ...args: any[]): number {
        return window.setInterval(fn, ms, ...args) as unknown as number;
    },

    clearInterval(id: number): void {
        window.clearInterval(id as any);
    },

    runBackgroundTimer(fn: (...args: any[]) => void, ms?: number): void {
        BackgroundTimer.setInterval(fn, ms);
    },

    stopBackgroundTimer(): void {
        // 由调用方自行 clearInterval
    },

    start(): void {},
    stop(): void {},
};

export default BackgroundTimer;
