import Config from "@/core/appConfig";
import i18n from "@/core/i18n";
import Toast from "@/utils/toast";
import { NativeModule, NativeModules, Platform } from "react-native";
import { errorLog } from "@/utils/log.ts";
import RNTrackPlayer, { State } from "react-native-track-player";

export enum NativeTextAlignment {
    // 左对齐
    LEFT = 3,
    // 右对齐
    RIGHT = 5,
    // 居中
    CENTER = 17,
}

export interface ILiveActivityState {
    lyric: string;
    previousLine?: string;
    nextLine?: string;
    /** 播放进度，0-1；不传则保留上一次进度 */
    progress?: number;
}

// 状态栏歌词的工具
interface ILyricUtil extends NativeModule {
    /** 显示状态栏歌词 */
    showStatusBarLyric: (
        initLyric?: string,
        config?: Record<string, any>,
    ) => Promise<void>;
    /** 隐藏状态栏歌词 */
    hideStatusBarLyric: () => Promise<void>;
    /** 设置歌词文本 */
    setStatusBarLyricText: (lyric: string) => Promise<void>;
    /** iOS 实时活动：更新歌词、上下文与进度 */
    updateLiveActivityState: (state: ILiveActivityState) => Promise<void>;
    /** iOS 实时活动：更新播放/暂停状态 */
    setLiveActivityPlaying: (isPlaying: boolean) => Promise<void>;
    /** iOS 实时活动：播放结束时关闭活动，但保留开关 */
    endLiveActivity: () => Promise<void>;
    /** 设置距离顶部的距离 */
    setStatusBarLyricTop: (percent: number) => Promise<void>;
    /** 设置距离左部的距离 */
    setStatusBarLyricLeft: (percent: number) => Promise<void>;
    /** 设置宽度 */
    setStatusBarLyricWidth: (percent: number) => Promise<void>;
    /** 设置字体 */
    setStatusBarLyricFontSize: (fontSize: number) => Promise<void>;
    /** 设置对齐 */
    setStatusBarLyricAlign: (alignment: NativeTextAlignment) => Promise<void>;
    /** 设置颜色 */
    setStatusBarColors: (
        textColor: string | null,
        backgroundColor: string | null,
    ) => Promise<void>;
    /** 检查权限 */
    checkSystemAlertPermission: () => Promise<boolean>;
    /** 请求悬浮窗 */
    requestSystemAlertPermission: () => Promise<boolean>;
}

const LyricUtil: ILyricUtil = NativeModules.LyricUtil;

const originalShowStatusBarLyric = LyricUtil.showStatusBarLyric;

const showStatusBarLyric: ILyricUtil["showStatusBarLyric"] = async (
    initLyric,
    config,
) => {
    try {
        if (Platform.OS === "ios") {
            // 可能在播放中途才打开开关；先把真实播放状态同步给原生层，
            // 否则活动要等到下一次暂停/继续才会出现。
            try {
                const { state } = await RNTrackPlayer.getPlaybackState();
                await setLiveActivityPlaying(
                    state === State.Playing || state === State.Buffering,
                );
            } catch {}
        }
        await originalShowStatusBarLyric(initLyric, config);
    } catch (e) {
        errorLog("状态栏歌词开启失败", e);
        Toast.warn(
            Platform.OS === "ios"
                ? i18n.t("toast.liveActivityDisabled")
                : "状态栏歌词开启失败，请到手机系统设置打开悬浮窗权限",
        );
        Config.setConfig("lyric.showStatusBarLyric", false);
    }
};

LyricUtil.showStatusBarLyric = showStatusBarLyric;

/** iOS 实时活动：更新当前歌词与上下文；Android 上为空操作 */
export function updateLiveActivityState(
    state: ILiveActivityState,
): Promise<void> {
    if (Platform.OS !== "ios" || !LyricUtil.updateLiveActivityState) {
        return Promise.resolve();
    }
    return LyricUtil.updateLiveActivityState(state);
}

/** iOS 实时活动：更新播放/暂停状态；Android 上为空操作 */
export function setLiveActivityPlaying(isPlaying: boolean): Promise<void> {
    if (Platform.OS !== "ios" || !LyricUtil.setLiveActivityPlaying) {
        return Promise.resolve();
    }
    return LyricUtil.setLiveActivityPlaying(isPlaying);
}

/** iOS 实时活动：播放结束时关闭活动，但保留开关；Android 上为空操作 */
export function endLiveActivity(): Promise<void> {
    if (Platform.OS !== "ios" || !LyricUtil.endLiveActivity) {
        return Promise.resolve();
    }
    return LyricUtil.endLiveActivity();
}

export default LyricUtil;
