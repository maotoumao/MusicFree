/**
 * react-native-device-info 桌面端实现
 * 应用信息从 package.json 注入的编译期常量读取,系统信息取自 navigator。
 */

declare const __DESKTOP_APP_VERSION__: string;
declare const __DESKTOP_APP_NAME__: string;

function getSystemVersion(): string {
    // Chromium 版本即可作为"系统版本"参考
    const m = navigator.userAgent.match(/Chrome\/([\d.]+)/);
    return m ? m[1] : "unknown";
}

const DeviceInfo = {
    getVersion: () => __DESKTOP_APP_VERSION__,
    getBuildNumber: () => "1",
    getSystemName: () => "Linux",
    getSystemVersion,
    getModel: () => "Desktop",
    getBrand: () => "MusicFree",
    getApplicationName: () => __DESKTOP_APP_NAME__,
    getBundleId: () => "com.musicfree.desktop",
    getDeviceId: () => "desktop",
    getDeviceName: () => "Desktop",
    isEmulator: async () => false,
    isTablet: () => false,
    getUsedMemory: async () => 0,
    getTotalMemory: async () => 0,
    getFontScale: () => 1,
    getPowerState: async () => ({ batteryLevel: 1, batteryState: "full", lowPowerMode: false }),
    getUserAgent: () => navigator.userAgent,
    hasNotch: () => false,
    supported32BitAbis: () => [],
    supported64BitAbis: () => [],
};

export default DeviceInfo;
