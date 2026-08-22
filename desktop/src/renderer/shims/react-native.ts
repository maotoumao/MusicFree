/**
 * react-native 桌面端 wrapper
 * 透传 react-native-web 全部导出,仅覆盖 Linking 以支持桌面深链:
 *  - musicfree://install/xxx 协议(插件安装)
 *  - 本地文件/文件夹拖入或系统唤起
 * 事件源:主进程通过 preload bridge 广播 desktop-event:open-url。
 */
import * as RNW from "react-native-web";

const bridge = (window as any).__MUSICFREE_DESKTOP__;

type LinkingListener = (event: { url: string }) => void;

const urlListeners = new Set<LinkingListener>();

function emitUrl(url: string) {
    urlListeners.forEach(listener => {
        try {
            listener({ url });
        } catch (e) {
            console.error("[linking] listener error", e);
        }
    });
}

// 订阅主进程广播的深链事件
try {
    bridge?.events?.on?.("open-url", (url: string) => {
        emitUrl(String(url));
    });
} catch {
    // preload 未就绪时忽略
}

const Linking = {
    addEventListener(_type: string, handler: LinkingListener) {
        urlListeners.add(handler);
        return {
            remove() {
                urlListeners.delete(handler);
            },
        };
    },

    removeEventListener(_type: string, handler: LinkingListener) {
        urlListeners.delete(handler);
    },

    /** 首次启动携带的 URL(如从浏览器唤起 musicfree:// 安装链接) */
    async getInitialURL(): Promise<string | null> {
        try {
            const url = await bridge?.app?.getInitialURL?.();
            return url ?? null;
        } catch {
            return null;
        }
    },

    async canOpenURL(url: string): Promise<boolean> {
        return typeof url === "string" && url.length > 0;
    },

    async openURL(url: string): Promise<void> {
        await bridge?.app?.openExternal?.(url);
    },

    async getInitialURLSync(): Promise<string | null> {
        return null;
    },
};

// 透传 react-native-web 全部导出,Linking 以本文件实现为准
export * from "react-native-web";
export { Linking };

// 保持 default 兼容(RNW 无 default 导出,这里提供命名空间对象)
const ReactNative = { ...RNW, Linking };
export default ReactNative;
