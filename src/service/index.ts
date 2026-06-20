import Config from "@/core/appConfig";
import RNTrackPlayer, { Event, State } from "react-native-track-player";
import TrackPlayer from "@/core/trackPlayer";
import { musicIsPaused } from "@/utils/trackUtils";
import PersistStatus from "@/utils/persistStatus";
import {
    androidAutoCommandPath,
    exportAndroidAutoPlaybackState,
    getAndroidAutoMediaId,
} from "@/utils/androidAutoCatalog";
import { readFile, unlink } from "react-native-fs";
import { getDefaultStore } from "jotai";
import bootstrapAtom from "@/entry/bootstrap/bootstrap.atom";

let resumeState: State | null;

type PendingAndroidAutoCommand = {
    id?: number;
    command?: string;
    mediaId?: string | null;
    position?: number | null;
};

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function playFirstAvailableTrack() {
    const target = TrackPlayer.currentMusic ?? TrackPlayer.playList[0];
    if (target) {
        return TrackPlayer.play(target, true);
    }
    return TrackPlayer.play();
}

function matchesSearchTerm(musicItem: IMusic.IMusicItem, rawTerm?: string) {
    const term = rawTerm?.trim().toLowerCase();
    if (!term) {
        return false;
    }
    return [musicItem.title, musicItem.artist, musicItem.album]
        .filter(Boolean)
        .some(value => value.toString().toLowerCase().includes(term));
}

function safeDecodeURIComponent(value: string) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function matchesMediaId(musicItem: IMusic.IMusicItem, rawMediaId?: string) {
    if (!rawMediaId) {
        return false;
    }

    const decodedMediaId = safeDecodeURIComponent(rawMediaId);
    return (
        getAndroidAutoMediaId(musicItem) === rawMediaId ||
        getAndroidAutoMediaId(musicItem) === decodedMediaId ||
        musicItem.id === rawMediaId ||
        `${musicItem.platform}:${musicItem.id}` === rawMediaId ||
        musicItem.id === decodedMediaId ||
        `${musicItem.platform}:${musicItem.id}` === decodedMediaId
    );
}

async function waitForBootstrapReady() {
    for (let i = 0; i < 20; ++i) {
        const bootstrapState = getDefaultStore().get(bootstrapAtom).state;
        if (
            bootstrapState === "Done" ||
            bootstrapState === "TrackPlayerError" ||
            bootstrapState === "Fatal"
        ) {
            return;
        }
        if (TrackPlayer.currentMusic || TrackPlayer.playList.length) {
            return;
        }
        await delay(500);
    }
}

async function readPendingAndroidAutoCommand() {
    try {
        const raw = await readFile(androidAutoCommandPath, "utf8");
        await unlink(androidAutoCommandPath).catch(() => undefined);
        const command = JSON.parse(raw) as PendingAndroidAutoCommand;
        if (!command?.command) {
            return null;
        }
        if (command.id && Date.now() - command.id > 120000) {
            return null;
        }
        return command;
    } catch {
        return null;
    }
}

async function handlePendingAndroidAutoCommand() {
    const command = await readPendingAndroidAutoCommand();
    if (!command) {
        return;
    }

    await waitForBootstrapReady();

    if (command.command === "next") {
        return TrackPlayer.skipToNext();
    }
    if (command.command === "previous") {
        return TrackPlayer.skipToPrevious();
    }
    if (command.command === "pause") {
        return TrackPlayer.pause();
    }
    if (command.command === "seek") {
        const position = Number(command.position);
        if (Number.isFinite(position)) {
            return TrackPlayer.seekTo(position);
        }
        return;
    }
    if (command.command === "play") {
        const target = TrackPlayer.playList.find(item =>
            matchesMediaId(item, command.mediaId ?? undefined),
        );
        if (target) {
            return TrackPlayer.play(target, true);
        }
        return playFirstAvailableTrack();
    }
}

module.exports = async function () {
    RNTrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
    RNTrackPlayer.addEventListener(Event.RemotePlayId, ({ id }) => {
        const target = TrackPlayer.playList.find(item => matchesMediaId(item, id));
        if (target) {
            return TrackPlayer.play(target, true);
        }
        return playFirstAvailableTrack();
    });
    RNTrackPlayer.addEventListener(Event.RemotePlaySearch, event => {
        const target =
            TrackPlayer.playList.find(item =>
                matchesSearchTerm(item, event.query) ||
                matchesSearchTerm(item, event.title) ||
                matchesSearchTerm(item, event.artist) ||
                matchesSearchTerm(item, event.album) ||
                matchesSearchTerm(item, event.genre) ||
                matchesSearchTerm(item, event.playlist),
            ) ?? null;
        if (target) {
            return TrackPlayer.play(target, true);
        }
        return playFirstAvailableTrack();
    });
    RNTrackPlayer.addEventListener(Event.RemotePause, () =>
        TrackPlayer.pause(),
    );
    RNTrackPlayer.addEventListener(Event.RemotePrevious, () =>
        TrackPlayer.skipToPrevious(),
    );
    RNTrackPlayer.addEventListener(Event.RemoteNext, () =>
        TrackPlayer.skipToNext(),
    );
    RNTrackPlayer.addEventListener(
        Event.RemoteDuck,
        async ({ paused, permanent }) => {
            if (Config.getConfig("basic.notInterrupt")) {
                return;
            }
            if (permanent) {
                return TrackPlayer.pause();
            }
            const tempRemoteDuckConf = Config.getConfig(
                "basic.tempRemoteDuck",
            );
            if (tempRemoteDuckConf === "lowerVolume") {
                if (paused) {
                    const tempRemoteDuckVolume = Config.getConfig(
                        "basic.tempRemoteDuckVolume",
                    ) ?? 0.5;
                    return RNTrackPlayer.setVolume(1 - tempRemoteDuckVolume);
                } else {
                    return RNTrackPlayer.setVolume(1);
                }
            } else {
                if (paused) {
                    resumeState =
                        (await RNTrackPlayer.getPlaybackState()).state ??
                        State.Paused;
                    return TrackPlayer.pause();
                } else {
                    if (resumeState && !musicIsPaused(resumeState)) {
                        resumeState = null;
                        return TrackPlayer.play();
                    }
                    resumeState = null;
                }
            }
        },
    );


    RNTrackPlayer.addEventListener(Event.PlaybackProgressUpdated, evt => {
        PersistStatus.set("music.progress", evt.position);
    });

    RNTrackPlayer.addEventListener(Event.PlaybackState, evt => {
        exportAndroidAutoPlaybackState(evt.state);
    });

    RNTrackPlayer.addEventListener(Event.RemoteStop, async () => {
        RNTrackPlayer.stop();
    });

    RNTrackPlayer.addEventListener(Event.RemoteSeek, async evt => {
        TrackPlayer.seekTo(evt.position);
    });

    handlePendingAndroidAutoCommand().catch(() => undefined);
};
