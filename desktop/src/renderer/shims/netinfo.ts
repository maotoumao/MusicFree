/**
 * @react-native-community/netinfo 桌面端实现
 * 使用 navigator.onLine + online/offline 事件。
 */

type NetInfoState = {
    type: string;
    isConnected: boolean | null;
    isInternetReachable: boolean | null;
    details: { isConnectionExpensive: boolean };
};

type Listener = (state: NetInfoState) => void;

const listeners = new Set<Listener>();

function currentState(): NetInfoState {
    const online = navigator.onLine;
    return {
        // 桌面端统一视作 wifi,不区分蜂窝网络
        type: online ? "wifi" : "none",
        isConnected: online,
        isInternetReachable: online ? true : null,
        details: { isConnectionExpensive: false },
    };
}

window.addEventListener("online", () => {
    const state = currentState();
    listeners.forEach(l => l(state));
});

window.addEventListener("offline", () => {
    const state = currentState();
    listeners.forEach(l => l(state));
});

const NetInfo = {
    fetch: async (): Promise<NetInfoState> => currentState(),

    addEventListener(listener: Listener): () => void {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },

    useNetInfo(): NetInfoState {
        return currentState();
    },

    configure: () => {},
};

export default NetInfo;
