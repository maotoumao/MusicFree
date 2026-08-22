/**
 * expo-keep-awake 桌面端实现
 * 通过 IPC 调用 Electron powerSaveBlocker 阻止系统休眠。
 */

const bridge = (window as any).__MUSICFREE_DESKTOP__;

export async function activateKeepAwakeAsync(_tag?: string): Promise<void> {
    try {
        await bridge?.app?.preventSleep?.();
    } catch {
        // ignore
    }
}

export function activateKeepAwake(_tag?: string): void {
    bridge?.app?.preventSleep?.().catch(() => {});
}

export function deactivateKeepAwake(_tag?: string): void {
    bridge?.app?.allowSleep?.().catch(() => {});
}

export default {
    activateKeepAwakeAsync,
    activateKeepAwake,
    deactivateKeepAwake,
};
