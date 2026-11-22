import { getDefaultStore } from "jotai";
import Config from "@/core/appConfig";
import { currentLyricItemAtom } from "@/core/lyricManager";
import TrackPlayer, { RNTrackPlayer } from "@/core/trackPlayer";
import { trace } from "@/utils/log";

let unsubscribe: (() => void) | null = null;

/** 当前写入的歌词行 (用于节流/恢复判断) */
let lastLine: string | null = null;

/**
 * 蓝牙歌词协议
 *
 * 将当前歌词行写入媒体会话元数据 (MediaSession title 字段滚动更新),
 * 经蓝牙 AVRCP 标准通道同步到已连接的车机 / 蓝牙设备屏幕显示。
 * 未连接蓝牙设备时仅为本地元数据更新, 无副作用。
 */
export function setupBluetoothLyric() {
    if (unsubscribe) {
        return;
    }
    unsubscribe = getDefaultStore().sub(currentLyricItemAtom, () => {
        try {
            if (Config.getConfig("basic.bluetoothLyric") === false) {
                return;
            }
            const musicItem = TrackPlayer.currentMusic;
            if (!musicItem) {
                return;
            }

            const lyricItem = getDefaultStore().get(currentLyricItemAtom);
            const line = lyricItem?.lrc?.trim();
            // 空行 / 与上一行相同: 不更新
            if (!line || line === lastLine) {
                return;
            }
            lastLine = line;

            // 歌词行写入元数据 title, 走 AVRCP 标准通道同步到蓝牙设备
            RNTrackPlayer.updateNowPlayingMetadata({
                title: line,
                artist: musicItem.artist,
                album: musicItem.album,
                artwork: musicItem.artwork,
            }).catch(() => {
                // 元数据更新失败静默 (部分设备不支持)
            });
            trace("[蓝牙歌词]", line);
        } catch {}
    });
}

export function teardownBluetoothLyric() {
    unsubscribe?.();
    unsubscribe = null;
    lastLine = null;
}
