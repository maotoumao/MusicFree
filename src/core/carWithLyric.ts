import Config from "@/core/appConfig";
import Theme from "@/core/theme";
import LyricParser from "@/utils/lrcParser";
import {
    addStateListener,
    getState,
    isCarWithSupported,
    pushLyric,
    setFollowTheme as nativeSetFollowTheme,
    setLyricEnabled as nativeSetLyricEnabled,
    type ICarWithState,
} from "@/native/carWithState";
import { AppState } from "react-native";

/**
 * CarWith（小米汽车互联）/ Jovi InCar 适配的 JS 那一半。
 *
 * 总设定：**没连着 CarWith 时上游行为逐字不变；连着才为车机改写媒体会话元数据与主题。**
 *
 * 分工：
 *   原生 CarWithState  —— 连接判据（虚拟屏屏名 + Display.getType 反射）+ ucar_night_mode
 *   原生 CarWithLyric  —— 门控 + 把整首/当前句贴到 MediaSession 元数据（键名、封面那几条规矩）
 *   本文件             —— 两把开关的持久化、歌词数据的取数与推送、主题跟随的判定与翻转上报
 *
 * 歌词数据从 lyricManager 来：换曲推「整首 + 当前句」，换句时把同一份整首原样再推一次。
 * 这里不按「连没连着」拦推送 —— 关着（开关没勾）才真的不推。连着与否由原生门控，
 * 这样连上车的那一刻原生手里就已经有这一首的歌词，不用等下一句切换。
 */

let connected = false;
let nightMode = -1;
let lyricEnabled = false;
let followTheme = false;

/** 最后一次推过去的两份，连接态翻回 true 时原样补推一次 */
let lastWhole = "";
let lastLine = "";
let lastHasLyric = false;

/**
 * ★ 最容易做错的一条：翻转上报只跟「上一次真正报给界面的值」比。
 *   不许拿「本轮开头现算一次、本轮结尾再算一次」代替 —— wantDark 是现算的，
 *   两次现算之间原生状态变了就两边相等，这次翻转谁也报不出去。
 */
let appliedDark: boolean | null = null;

/** 两把开关至少勾一把才值得去读数，全关着时连虚拟屏都不枚举 */
function active() {
    return lyricEnabled || followTheme;
}

/** [mm:ss.xx] —— 车机侧 LRC 解析只认这个格式 */
function timeToLrctime(sec: number): string {
    const totalCs = Math.max(0, Math.round(sec * 100));
    const mm = Math.floor(totalCs / 6000);
    const ss = Math.floor((totalCs % 6000) / 100);
    const cs = totalCs % 100;
    return `[${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${String(
        cs,
    ).padStart(2, "0")}]`;
}

/**
 * 整首标准 LRC。
 * 时间戳要**带上歌词偏移**：parser.getPosition 里是 `position - meta.offset`，
 * 也就是说 item.time 是「不含偏移」的原始时间，车机拿去和真实播放位置比要加回去。
 * 只出主行，不带译文（车机一屏一行，带译文会把行高挤掉）。
 *
 * 整首按 parser 缓存：逐句那一路每秒来一次，几百行 join 一次是白烧 CPU
 * （偏移一改 lyricManager 就 new 一个新 parser，缓存自然失效，不用另设 invalidate）。
 */
let wholeCacheParser: LyricParser | null = null;
let wholeCache = "";

function buildWholeLyric(parser: LyricParser | null | undefined): string {
    if (!parser) return "";
    if (parser === wholeCacheParser) return wholeCache;
    const items = parser.getLyricItems?.() ?? [];
    const offset = Number(parser.getMeta?.()?.offset ?? 0) || 0;
    const whole = items.length
        ? items
            .map(item => `${timeToLrctime(item.time + offset)} ${item.lrc ?? ""}`)
            .join("\r\n")
        : "";
    wholeCacheParser = parser;
    wholeCache = whole;
    return whole;
}

function pushInternal(whole: string, line: string) {
    lastWhole = whole;
    lastLine = line;
    lastHasLyric = !!whole || !!line;
    pushLyric(whole, line, lastHasLyric);
}

/**
 * 推一份歌词：换曲推「整首 + 当前句」，换句也是这一个入口（整首走缓存）。
 * parser 为 null（没词、正在加载、换曲那一下）就是清空 —— 整首为空也要写，不能跳过：
 * 跳过等于把上一首留在会话里，车机就一直停在最后一句。
 */
export function pushLyricState(
    parser: LyricParser | null | undefined,
    currentLine?: string,
) {
    if (!lyricEnabled) return;
    pushInternal(buildWholeLyric(parser), currentLine ?? "");
}

function applyTheme() {
    // 判定：勾了 && 连着 && 车机真报了深浅（-1 读不到不覆盖）⇒ 覆盖；其余一律回到用户自己那档
    const wantDark =
        followTheme && connected && nightMode >= 0 ? nightMode === 1 : null;
    if (wantDark === appliedDark) return;
    appliedDark = wantDark;
    if (wantDark === null) {
        Theme.restoreStoredTheme();
    } else {
        Theme.applyCarWithTheme(wantDark);
    }
}

function onStateChange(state: ICarWithState) {
    const changedConnected = state.connected !== connected;
    connected = !!state.connected;
    nightMode = typeof state.nightMode === "number" ? state.nightMode : -1;
    applyTheme();
    // 连上来回补推一次：开关是冷的（没推过）就不动
    if (changedConnected && connected && lyricEnabled && (lastWhole || lastLine)) {
        pushLyric(lastWhole, lastLine, lastHasLyric);
    }
}

function refreshNow() {
    if (!isCarWithSupported() || !active()) return;
    getState(true).then(onStateChange);
}

/** 两把开关的初始值 + 连接态首轮；由 bootstrap 在 lyricManager.setup() 之后调 */
export function setup() {
    if (!isCarWithSupported()) return;
    lyricEnabled = !!Config.getConfig("lyric.showCarWithLyric");
    followTheme = !!Config.getConfig("theme.followCarWith");
    nativeSetLyricEnabled(lyricEnabled);
    nativeSetFollowTheme(followTheme);
    addStateListener(onStateChange);
    // 冷启动去坐车：不该等用户进设置碰一下开关才开始跟随，开局就现读一轮
    refreshNow();
    AppState.addEventListener("change", next => {
        if (next === "active") {
            refreshNow();
        }
    });
}

export function setLyricEnabled(value: boolean) {
    lyricEnabled = value;
    Config.setConfig("lyric.showCarWithLyric", value);
    nativeSetLyricEnabled(value);
    if (value) {
        refreshNow();
    } else {
        // 关掉当场把整首与当前句收掉，车机不停在最后一句
        pushInternal("", "");
    }
}

export function setFollowTheme(value: boolean) {
    followTheme = value;
    Config.setConfig("theme.followCarWith", value);
    nativeSetFollowTheme(value);
    if (value) {
        refreshNow();
    } else {
        applyTheme();
    }
}

const CarWithLyric = {
    setup,
    pushLyricState,
    setLyricEnabled,
    setFollowTheme,
    isSupported: isCarWithSupported,
};

export default CarWithLyric;
