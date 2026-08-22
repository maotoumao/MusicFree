/**
 * MPRIS D-Bus 服务
 * 桌面环境(GNOME/KDE 等)媒体键与媒体中心集成,
 * 属性与控制事件由渲染进程的 TrackPlayer shim 通过 IPC 推送/接收。
 */
import { BrowserWindow } from "electron";
import { broadcastRendererEvent } from "./ipc";

interface MprisState {
    playbackStatus: "Playing" | "Paused" | "Stopped";
    metadata: Record<string, any>;
    canGoNext: boolean;
    canGoPrevious: boolean;
    loopStatus: "None" | "Track" | "Playlist";
    shuffle: boolean;
    volume: number;
    position: number; // 毫秒
}

const dbus = require("dbus-next");
const { Variant } = dbus;

function msToUs(ms: number): bigint {
    return BigInt(Math.max(0, Math.round(ms * 1000)));
}

export class MprisService {
    private bus: any = null;
    private rootIface: any = null;
    private playerIface: any = null;
    private state: MprisState = {
        playbackStatus: "Stopped",
        metadata: {},
        canGoNext: true,
        canGoPrevious: true,
        loopStatus: "None",
        shuffle: false,
        volume: 1,
        position: 0,
    };

    constructor(private getWindow: () => BrowserWindow | null) {}

    async init() {
        const hasSession =
            !!process.env.DBUS_SESSION_BUS_ADDRESS ||
            !!process.env.XDG_RUNTIME_DIR;
        if (!hasSession) {
            console.log("[mpris] no dbus session detected, skip");
            return;
        }
        try {
            this.bus = dbus.sessionBus();
        } catch (err) {
            console.warn("[mpris] connect failed:", err?.message);
            return;
        }
        if (!this.bus) return;

        this.rootIface = this.createRootInterface();
        this.playerIface = this.createPlayerInterface();

        this.bus.export("/org/mpris/MediaPlayer2", this.rootIface);
        this.bus.export("/org/mpris/MediaPlayer2", this.playerIface);
        await this.bus.requestName("org.mpris.MediaPlayer2.musicfree", 0);
        console.log("[mpris] service registered");
    }

    private createRootInterface() {
        const self = this;
        class RootInterface extends dbus.interface.Interface {
            constructor() {
                super("org.mpris.MediaPlayer2");
            }
            Raise() {
                const win = self.getWindow();
                win?.show();
                win?.focus();
            }
            Quit() {
                broadcastRendererEvent("media-control", "stop");
                setTimeout(() => process.exit(0), 100);
            }
        }
        RootInterface.configureMembers({
            methods: {
                Raise: { inSignature: "", outSignature: "" },
                Quit: { inSignature: "", outSignature: "" },
            },
            properties: {
                CanQuit: { signature: "b" },
                CanRaise: { signature: "b" },
                CanFullscreen: { signature: "b" },
                HasTrackList: { signature: "b" },
                Identity: { signature: "s" },
                DesktopEntry: { signature: "s" },
                SupportedUriSchemes: { signature: "as" },
                SupportedMimeTypes: { signature: "as" },
            },
        });
        const iface = new RootInterface() as any;
        Object.assign(iface, {
            CanQuit: true,
            CanRaise: true,
            CanFullscreen: false,
            HasTrackList: false,
            Identity: "MusicFree",
            DesktopEntry: "musicfree",
            SupportedUriSchemes: [],
            SupportedMimeTypes: ["audio/mpeg", "audio/flac", "audio/x-flac", "audio/ogg"],
        });
        return iface;
    }

    private createPlayerInterface() {
        const self = this;
        class PlayerInterface extends dbus.interface.Interface {
            constructor() {
                super("org.mpris.MediaPlayer2.Player");
            }
            Next() {
                broadcastRendererEvent("media-control", "next");
            }
            Previous() {
                broadcastRendererEvent("media-control", "previous");
            }
            Pause() {
                broadcastRendererEvent("media-control", "pause");
            }
            PlayPause() {
                broadcastRendererEvent("media-control", "playpause");
            }
            Stop() {
                broadcastRendererEvent("media-control", "stop");
            }
            Play() {
                broadcastRendererEvent("media-control", "play");
            }
            Seek(offset: bigint) {
                broadcastRendererEvent(
                    "media-control",
                    "seek",
                    Number(offset) / 1000,
                );
            }
            SetPosition(_trackId: string, position: bigint) {
                broadcastRendererEvent(
                    "media-control",
                    "seekTo",
                    Number(position) / 1000,
                );
            }
            OpenUri(uri: string) {
                broadcastRendererEvent("media-control", "openUri", uri);
            }
        }
        PlayerInterface.configureMembers({
            methods: {
                Next: { inSignature: "", outSignature: "" },
                Previous: { inSignature: "", outSignature: "" },
                Pause: { inSignature: "", outSignature: "" },
                PlayPause: { inSignature: "", outSignature: "" },
                Stop: { inSignature: "", outSignature: "" },
                Play: { inSignature: "", outSignature: "" },
                Seek: { inSignature: "x", outSignature: "" },
                SetPosition: { inSignature: "ox", outSignature: "" },
                OpenUri: { inSignature: "s", outSignature: "" },
            },
            properties: {
                PlaybackStatus: { signature: "s" },
                LoopStatus: { signature: "s" },
                Rate: { signature: "d" },
                Shuffle: { signature: "b" },
                Metadata: { signature: "a{sv}" },
                Volume: { signature: "d" },
                Position: { signature: "x" },
                CanGoNext: { signature: "b" },
                CanGoPrevious: { signature: "b" },
                CanPlay: { signature: "b" },
                CanPause: { signature: "b" },
                CanSeek: { signature: "b" },
                CanControl: { signature: "b" },
            },
            signals: {
                Seeked: { signature: "x" },
            },
        });

        const iface = new PlayerInterface() as any;
        const state = this.state;
        Object.defineProperties(iface, {
            PlaybackStatus: {
                get: () => state.playbackStatus,
                enumerable: true,
                configurable: true,
            },
            LoopStatus: {
                get: () => state.loopStatus,
                enumerable: true,
                configurable: true,
            },
            Rate: {
                get: () => 1.0,
                enumerable: true,
                configurable: true,
            },
            Shuffle: {
                get: () => state.shuffle,
                enumerable: true,
                configurable: true,
            },
            Metadata: {
                get: () => self.buildMetadata(),
                enumerable: true,
                configurable: true,
            },
            Volume: {
                get: () => state.volume,
                enumerable: true,
                configurable: true,
                set: (v: number) => {
                    state.volume = v;
                    broadcastRendererEvent("media-control", "volume", v);
                },
            },
            Position: {
                get: () => msToUs(state.position),
                enumerable: true,
                configurable: true,
            },
            CanGoNext: {
                get: () => state.canGoNext,
                enumerable: true,
                configurable: true,
            },
            CanGoPrevious: {
                get: () => state.canGoPrevious,
                enumerable: true,
                configurable: true,
            },
            CanPlay: {
                get: () => true,
                enumerable: true,
                configurable: true,
            },
            CanPause: {
                get: () => true,
                enumerable: true,
                configurable: true,
            },
            CanSeek: {
                get: () => true,
                enumerable: true,
                configurable: true,
            },
            CanControl: {
                get: () => true,
                enumerable: true,
                configurable: true,
            },
        });
        return iface;
    }

    private buildMetadata() {
        const md = this.state.metadata ?? {};
        const result: Record<string, any> = {
            "mpris:trackid": new Variant(
                "o",
                md.trackId || "/org/mpris/MediaPlayer2/TrackList/NoTrack",
            ),
            "mpris:length": new Variant("x", msToUs(md.duration ?? 0)),
            "mpris:artUrl": new Variant("s", md.artUrl ?? ""),
            "xesam:title": new Variant("s", md.title ?? ""),
            "xesam:artist": new Variant("as", md.artist ? [md.artist] : []),
            "xesam:album": new Variant("s", md.album ?? ""),
            "xesam:url": new Variant("s", md.url ?? ""),
        };
        return result;
    }

    /** 渲染进程推送状态 */
    update(partial: Partial<MprisState>) {
        const changed: Record<string, any> = {};
        for (const key of Object.keys(partial) as Array<keyof MprisState>) {
            const newValue = (partial as any)[key];
            if ((this.state as any)[key] !== newValue) {
                (this.state as any)[key] = newValue;
                if (key === "metadata") {
                    // a{sv} 需要 Variant 映射形式
                    changed.Metadata = this.buildMetadata();
                    continue;
                }
                if (key === "position") {
                    // MPRIS 规范:Position 不发 PropertiesChanged,客户端轮询
                    continue;
                }
                const propName =
                    key === "playbackStatus"
                        ? "PlaybackStatus"
                        : key === "loopStatus"
                          ? "LoopStatus"
                          : key === "volume"
                              ? "Volume"
                              : key === "canGoNext"
                                  ? "CanGoNext"
                                  : key === "canGoPrevious"
                                      ? "CanGoPrevious"
                                      : key === "shuffle"
                                          ? "Shuffle"
                                          : key;
                changed[propName] = newValue;
            }
        }
        if (Object.keys(changed).length && this.playerIface) {
            try {
                dbus.interface.Interface.emitPropertiesChanged(
                    this.playerIface,
                    changed,
                );
            } catch (e) {
                console.warn("[mpris] properties changed failed:", e?.message);
            }
        }
    }

    destroy() {
        try {
            this.bus?.disconnect();
        } catch {
            // ignore
        }
        this.bus = null;
        this.rootIface = null;
        this.playerIface = null;
    }
}
