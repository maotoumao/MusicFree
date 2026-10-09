import Config from "@/core/appConfig";
import { errorLog } from "@/utils/log";
import RNTrackPlayer from "react-native-track-player";

/**
 * 蓝牙歌词（车机歌词）
 *
 * 原理：蓝牙 AVRCP 协议并没有「歌词」这个字段，车机能读到的只有
 * 歌曲名 / 歌手 / 专辑 等元信息（Android MediaSession Metadata）。
 * 所以这里的做法是：把当前这一句歌词写进其中一个元信息字段，
 * Android 系统会把更新后的元信息通过蓝牙推给车机，车机把它当普通文本显示。
 *
 * 实测只有「歌曲名」和「歌手」两个字段真正有效：
 * react-native-track-player 的 updateMetadataForTrack 最终走 KotlinAudio 的
 * replaceItem -> overrideAudioItem，MediaSession 的 title / artist 取自
 * overrideAudioItem，album / genre 仍取自播放器原始 MediaItem，写了也不刷新。
 * 因此这里只提供这两个字段，外加一个「歌名 + 歌词」的组合模式。
 */

/** 歌词写进哪个元信息字段 */
export type BluetoothLyricField =
    | "split"
    | "title"
    | "titleAppend"
    | "artist";

/**
 * 选项顺序即设置页展示顺序
 * split 是网易云音乐同款的写法，实测抓包确认过，兼容性最好
 */
export const bluetoothLyricFields: BluetoothLyricField[] = [
    "split",
    "title",
    "titleAppend",
    "artist",
];

/** MusicFree 的播放队列固定把当前歌曲放在 0 号位 */
const CURRENT_TRACK_INDEX = 0;
/** 两次元信息推送的最小间隔(ms)：原生侧刷新有节流，推太快会丢更新 */
const MIN_UPDATE_INTERVAL = 600;
/** 单行最长字符数，车机屏幕通常放不下太长的句子 */
const MAX_TEXT_LENGTH = 80;

type Metadata = {
    title: string;
    artist: string;
    album: string;
    genre: string;
};

interface IPendingTask {
    metadata: Metadata;
    musicItem?: IMusic.IMusicItem | null;
    text: string;
}

class BluetoothLyric {
    /** 上一次真正推送出去的文本，用于去重 */
    private lastText: string | null = null;
    private lastUpdateAt = 0;
    /** 是否正在推送中，用于串行化，避免并发写元信息 */
    private sending = false;
    /** 推送期间收到的最新任务 */
    private pendingTask: IPendingTask | null = null;
    private throttleTimer: ReturnType<typeof setTimeout> | null = null;

    /** 开关是否打开 */
    get enabled() {
        return !!Config.getConfig("lyric.bluetoothLyric");
    }

    /** 歌词写进哪个字段 */
    private get field(): BluetoothLyricField {
        return Config.getConfig("lyric.bluetoothLyricField") ?? "split";
    }

    /**
     * 把歌词整理成适合车机单行显示的文本
     * - 去掉空行（没有翻译时会多出一个空行）
     * - 翻译用 " / " 接在原文后面，车机大多不支持换行
     */
    private normalize(lrc?: string | null, translation?: string | null) {
        const showTranslation = Config.getConfig(
            "lyric.bluetoothLyricTranslation",
        );
        const lines = [lrc ?? ""];
        if (showTranslation && translation) {
            lines.push(translation);
        }
        const text = lines
            .join("\n")
            .split("\n")
            .map(_ => _.trim())
            .filter(_ => _.length > 0)
            .join(" / ");
        if (text.length > MAX_TEXT_LENGTH) {
            return `${text.slice(0, MAX_TEXT_LENGTH)}…`;
        }
        return text;
    }

    /** 歌曲本身的元信息（不含歌词），无歌词时兜底，也用于还原 */
    private buildBaseMetadata(musicItem?: IMusic.IMusicItem | null): Metadata {
        return {
            title: musicItem?.title ?? "MusicFree",
            artist: musicItem?.artist ?? "",
            album: musicItem?.album ?? "",
            genre: "",
        };
    }

    /** 按用户选择的字段，把歌词拼进元信息 */
    private buildMetadata(
        musicItem: IMusic.IMusicItem | null | undefined,
        lyricText: string,
    ): Metadata {
        const base = this.buildBaseMetadata(musicItem);
        switch (this.field) {
            case "artist":
                // 歌词放歌手位：歌名保持正常，车机上歌名和歌词一起显示
                base.artist = lyricText;
                break;
            case "titleAppend":
                // 歌词接在歌名后面，形如「歌名 · 歌词」
                base.title = musicItem?.title
                    ? `${musicItem.title} · ${lyricText}`
                    : lyricText;
                break;
            case "title":
                // 歌词直接占用歌曲名位：会挤掉歌名
                base.title = lyricText;
                break;
            case "split":
            default:
                // 网易云音乐同款：歌词占歌曲名位，同时把「歌名 - 歌手」挪到歌手位，
                // 这样车机上歌词和歌名能同时显示，两边信息都不丢
                base.title = lyricText;
                base.artist = musicItem?.title
                    ? `${musicItem.title} - ${musicItem.artist ?? ""}`
                    : (musicItem?.artist ?? "");
                break;
        }
        return base;
    }

    /** 取出去重比对用的文本（也就是车机上会被替换掉的那一项） */
    private getKeyText(metadata: Metadata) {
        return this.field === "artist" ? metadata.artist : metadata.title;
    }

    /**
     * 推送歌词到车机
     * @param musicItem 当前歌曲
     * @param lrc 当前这一句歌词
     * @param translation 当前这一句的翻译
     */
    update(
        musicItem?: IMusic.IMusicItem | null,
        lrc?: string | null,
        translation?: string | null,
    ) {
        if (!this.enabled) {
            return;
        }

        const lyricText = this.normalize(lrc, translation);
        // 没有歌词时退回显示歌曲本身的信息，至少车机上不会一直停在上句歌词
        const metadata = lyricText
            ? this.buildMetadata(musicItem, lyricText)
            : this.buildBaseMetadata(musicItem);
        const text = this.getKeyText(metadata);

        if (text === this.lastText) {
            // 内容没变化就不推，避免元信息无意义地刷屏
            return;
        }

        const now = Date.now();
        const wait = MIN_UPDATE_INTERVAL - (now - this.lastUpdateAt);

        if (wait > 0) {
            // 距上次推送太近，延后到窗口结束再发；期间的新歌词会覆盖旧值，
            // 保证车机最终拿到的一定是最新一句
            if (this.throttleTimer) {
                clearTimeout(this.throttleTimer);
            }
            this.throttleTimer = setTimeout(() => {
                this.throttleTimer = null;
                this.send(metadata, musicItem, text);
            }, wait);
            return;
        }

        this.send(metadata, musicItem, text);
    }

    /** 清掉去重缓存，立刻用当前歌词再推一次（切换字段 / 打开开关时调用） */
    refresh(
        musicItem?: IMusic.IMusicItem | null,
        lrc?: string | null,
        translation?: string | null,
    ) {
        if (!this.enabled) {
            return;
        }
        this.lastText = null;
        this.update(musicItem, lrc, translation);
    }

    /**
     * 只清掉本地缓存，不碰播放器元信息
     * 用于「清空播放队列」这类场景：此时队列已被 reset，再推元信息没有意义，
     * 但如果不清缓存，下一首歌的第一句若恰好和之前某句文本相同，
     * 会被去重逻辑误判为「没变化」而跳过推送，导致车机上少显示一句。
     */
    clearCache() {
        if (this.throttleTimer) {
            clearTimeout(this.throttleTimer);
            this.throttleTimer = null;
        }
        this.pendingTask = null;
        this.lastText = null;
        this.lastUpdateAt = 0;
    }

    /** 还原元信息：把被歌词占用的字段改回歌曲本身的信息（关闭开关时调用） */
    async reset(musicItem?: IMusic.IMusicItem | null) {
        if (this.throttleTimer) {
            clearTimeout(this.throttleTimer);
            this.throttleTimer = null;
        }
        this.pendingTask = null;
        this.lastText = null;
        await this.send(this.buildBaseMetadata(musicItem), musicItem, null, true);
    }

    /**
     * 真正写元信息
     * @param text 为 null 表示本次是「还原」，此时直接写回歌曲本身的信息
     * @param force 关闭开关后的还原不受 enabled 限制
     */
    private async send(
        metadata: Metadata,
        musicItem?: IMusic.IMusicItem | null,
        text: string | null = null,
        force = false,
    ) {
        if (!this.enabled && !force) {
            return;
        }

        if (this.sending) {
            this.pendingTask = { metadata, musicItem, text: text ?? "" };
            return;
        }

        this.sending = true;
        try {
            // artwork / duration 必须一起带上：原生侧 setMetadata 是全量覆盖，
            // 缺失的字段会被置空（封面会丢），所以先从当前曲目上取回来补上
            const currentTrack: any = await RNTrackPlayer.getTrack(
                CURRENT_TRACK_INDEX,
            ).catch(() => null);

            if (!currentTrack) {
                return;
            }

            await RNTrackPlayer.updateMetadataForTrack(CURRENT_TRACK_INDEX, {
                ...metadata,
                artwork: currentTrack.artwork,
                duration: currentTrack.duration,
            } as any);

            this.lastText = text;
            this.lastUpdateAt = Date.now();
        } catch (e) {
            errorLog("蓝牙歌词更新失败", e);
        } finally {
            this.sending = false;
            const pending = this.pendingTask;
            if (pending) {
                this.pendingTask = null;
                await this.send(
                    pending.metadata,
                    pending.musicItem,
                    pending.text,
                    force,
                );
            }
        }
    }
}

const bluetoothLyric = new BluetoothLyric();
export default bluetoothLyric;
