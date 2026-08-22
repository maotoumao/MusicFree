/**
 * expo-splash-screen 桌面端实现
 * 桌面端无原生开屏页,全部为 no-op。
 */

export async function preventAutoHideAsync(): Promise<boolean> {
    return true;
}

export async function hideAsync(): Promise<void> {
    // 桌面端直接显示,无需处理
}

export default {
    preventAutoHideAsync,
    hideAsync,
};
