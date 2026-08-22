/**
 * react-native-permissions 桌面端实现
 * 桌面应用没有运行时权限模型,统一返回 granted。
 */

export const PERMISSIONS = {
    ANDROID: {
        READ_EXTERNAL_STORAGE: "android.permission.READ_EXTERNAL_STORAGE",
        WRITE_EXTERNAL_STORAGE: "android.permission.WRITE_EXTERNAL_STORAGE",
        READ_MEDIA_AUDIO: "android.permission.READ_MEDIA_AUDIO",
        POST_NOTIFICATIONS: "android.permission.POST_NOTIFICATIONS",
    },
    IOS: {},
} as const;

export const RESULTS = {
    UNAVAILABLE: "unavailable",
    BLOCKED: "blocked",
    DENIED: "denied",
    GRANTED: "granted",
    LIMITED: "limited",
} as const;

export async function check(_permission: string): Promise<string> {
    return RESULTS.GRANTED;
}

export async function request(_permission: string): Promise<string> {
    return RESULTS.GRANTED;
}

export async function checkMultiple(permissions: string[]): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const p of permissions) {
        result[p] = RESULTS.GRANTED;
    }
    return result;
}

export async function requestMultiple(permissions: string[]): Promise<Record<string, string>> {
    return checkMultiple(permissions);
}

export async function openSettings(): Promise<boolean> {
    return false;
}
