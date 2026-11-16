import { NativeEventEmitter, NativeModules, Platform } from "react-native";

/**
 * CarWith 原生门的 JS 包装。
 * 原生侧：android/app/src/main/java/fun/upup/musicfree/carwith/CarWithState.kt
 * 歌词那一半走的是 react-native-track-player 的 TrackPlayerModule.setCarWithLyric，
 * 不经过这里（这里只管连接态与两把开关）。
 */

export interface ICarWithState {
    /** 车机是否连着 */
    connected: boolean;
    /** -1 读不到 / 0 车机浅色 / 1 车机深色 */
    nightMode: number;
    lyricEnabled: boolean;
    followTheme: boolean;
}

const defaultState: ICarWithState = {
    connected: false,
    nightMode: -1,
    lyricEnabled: false,
    followTheme: false,
};

const nativeModule: any = (NativeModules as any).CarWithState;
const trackPlayerModule: any = (NativeModules as any).TrackPlayerModule;

/** 鸿蒙那一侧没有这个原生模块，所有调用点都要能空转 */
const supported = Platform.OS === "android" && !!nativeModule;

export function isCarWithSupported() {
    return supported;
}

/** refresh = true 时现读一轮（回前台、刚勾开关那两处用） */
export async function getState(refresh?: boolean): Promise<ICarWithState> {
    if (!supported) {
        return { ...defaultState };
    }
    try {
        const snap = refresh ? await nativeModule.refresh() : await nativeModule.getState();
        return { ...defaultState, ...(snap ?? {}) };
    } catch {
        return { ...defaultState };
    }
}

export function setLyricEnabled(enabled: boolean) {
    if (!supported) return;
    try {
        nativeModule.setLyricEnabled?.(enabled);
    } catch {}
}

export function setFollowTheme(follow: boolean) {
    if (!supported) return;
    try {
        nativeModule.setFollowTheme?.(follow);
    } catch {}
}

export function addStateListener(
    callback: (state: ICarWithState) => void,
): () => void {
    if (!supported) return () => {};
    try {
        const emitter = new NativeEventEmitter(nativeModule);
        const subscription = emitter.addListener(
            "onCarWithStateChange",
            (payload: ICarWithState) => {
                callback({ ...defaultState, ...(payload ?? {}) });
            },
        );
        return () => subscription.remove();
    } catch {
        return () => {};
    }
}

/**
 * 贴到 MediaSession 元数据上。三个参数一次给全，别凑「新歌整首 + 旧歌当前句」。
 * whole / line 给空串就是「这首歌没词」，原生会照写空串把上一首洗掉；超限由原生发空串。
 */
export function pushLyric(whole: string, line: string, hasLyric: boolean) {
    if (!trackPlayerModule?.setCarWithLyric) return;
    try {
        trackPlayerModule.setCarWithLyric(
            whole || null,
            line || null,
            hasLyric ? 0 : 3,
        );
    } catch {}
}
