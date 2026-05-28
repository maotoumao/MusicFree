import pathConst from "@/constants/pathConst";
import { safeStringify } from "@/utils/jsonUtil";
import { writeFile } from "react-native-fs";

type AndroidAutoCatalogItem = {
    mediaId: string;
    id: string;
    platform: string;
    title: string;
    artist?: string;
    album?: string;
    artwork?: string;
    duration?: number;
};

export const androidAutoCatalogPath = `${pathConst.dataPath}android_auto_catalog.json`;
export const androidAutoCommandPath = `${pathConst.dataPath}android_auto_command.json`;

let catalogExportTask: Promise<void> = Promise.resolve();
let lastPlayList: IMusic.IMusicItem[] = [];
let lastCurrentMusic: IMusic.IMusicItem | null = null;
let lastPlaybackState: string | null = null;
let hasCatalogSnapshot = false;

export function getAndroidAutoMediaId(musicItem: IMusic.IMusicItem) {
    return `${encodeURIComponent(musicItem.platform)}:${encodeURIComponent(musicItem.id)}`;
}

function getCatalogArtwork(artwork: unknown) {
    if (typeof artwork !== "string") {
        return undefined;
    }
    const trimmedArtwork = artwork.trim();
    return trimmedArtwork.length ? trimmedArtwork : undefined;
}

function toCatalogItem(musicItem: IMusic.IMusicItem): AndroidAutoCatalogItem {
    const artwork = getCatalogArtwork(musicItem.artwork);
    return {
        mediaId: getAndroidAutoMediaId(musicItem),
        id: musicItem.id,
        platform: musicItem.platform,
        title: musicItem.title,
        artist: musicItem.artist,
        album: musicItem.album,
        ...(artwork ? { artwork } : {}),
        duration: musicItem.duration,
    };
}

function writeAndroidAutoCatalog() {
    const currentMediaId = lastCurrentMusic ? getAndroidAutoMediaId(lastCurrentMusic) : null;
    const items: AndroidAutoCatalogItem[] = lastPlayList.slice(0, 500).map(item => {
        const mediaId = getAndroidAutoMediaId(item);
        return toCatalogItem(
            lastCurrentMusic && mediaId === currentMediaId
                ? {
                    ...item,
                    ...lastCurrentMusic,
                    id: item.id,
                    platform: item.platform,
                }
                : item,
        );
    });

    if (
        lastCurrentMusic &&
        !items.some(item => item.mediaId === currentMediaId)
    ) {
        items.unshift(toCatalogItem(lastCurrentMusic));
        items.splice(500);
    }

    const catalogJson = safeStringify({
        currentMediaId,
        playbackState: lastPlaybackState,
        items,
    });

    catalogExportTask = catalogExportTask
        .catch(() => undefined)
        .then(() => writeFile(androidAutoCatalogPath, catalogJson, "utf8"))
        .catch(() => undefined);

    return catalogExportTask;
}

export function exportAndroidAutoCatalog(
    playList: IMusic.IMusicItem[],
    currentMusic?: IMusic.IMusicItem | null,
) {
    lastPlayList = playList;
    lastCurrentMusic = currentMusic ?? null;
    hasCatalogSnapshot = true;
    return writeAndroidAutoCatalog();
}

export function exportAndroidAutoPlaybackState(playbackState?: string | null) {
    lastPlaybackState = playbackState ?? null;
    return hasCatalogSnapshot ? writeAndroidAutoCatalog() : Promise.resolve();
}
