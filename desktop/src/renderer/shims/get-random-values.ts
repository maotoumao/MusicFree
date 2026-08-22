/**
 * react-native-get-random-values 桌面端实现
 * 浏览器原生 crypto.getRandomValues 即可。
 */

if (typeof globalThis.crypto?.getRandomValues !== "function") {
    // 理论上 Electron Chromium 必定支持,保底实现
    (globalThis as any).crypto = {
        ...((globalThis as any).crypto ?? {}),
        getRandomValues: (array: any) => {
            for (let i = 0; i < array.length; i++) {
                array[i] = (Math.random() * 0xffffffff) >>> 0;
            }
            return array;
        },
    };
}

export {};
