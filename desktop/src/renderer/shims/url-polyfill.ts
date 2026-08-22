/**
 * react-native-url-polyfill 桌面端实现
 * Chromium 原生 URL/URLSearchParams 已符合标准,直接透传全局实现。
 */

export const URL: typeof globalThis.URL = globalThis.URL;
export const URLSearchParams: typeof globalThis.URLSearchParams =
    globalThis.URLSearchParams;

export default {};
