/**
 * 本地文件 → MusicItem/LocalFileMeta 转换 + 指纹序列化
 * 纯函数（无副作用、不 mutate 入参、无 IO/时钟）；draft 累加与副作用（写 mediaMeta / set atom / 落 MMKV）由 index 编排
 */
import CryptoJS from 'crypto-js';

import { parseEmbeddedIdentity } from '@/utils/embeddedIdentity';
import { LOCAL_MEDIA_PLATFORM, localPathToUri } from '@/utils/media';

import type { LocalFileMeta } from './types';
import type { AudioTagSnapshot } from '@/infra/audioTags';
import type { ScannedAudioFile } from '@/native/mediaScanner';
import type { MediaRef, MusicItem } from '@/types';

/**
 * 文件路径 → 本地扫描身份：镜像原生的 id 算法（canonical 绝对路径 UTF-8 字节 MD5、小写 hex）
 * 算法已在 NativeMediaScanner spec 冻结；此处复现是为了归化 / 删文件时能对齐扫描侧同一身份
 */
export function localRefOfPath(path: string): MediaRef {
    return {
        platform: LOCAL_MEDIA_PLATFORM,
        id: CryptoJS.MD5(path).toString(),
    };
}

/**
 * ScannedAudioFile → MusicItem（url=编码 file://、duration 秒；封面懒取故 artwork 空）
 */
export function toMusicItem(f: ScannedAudioFile): MusicItem {
    return withEmbeddedIdentity(f.path, f.mfMusicItem, () => ({
        platform: LOCAL_MEDIA_PLATFORM,
        id: f.id,
        title: f.title,
        artist: f.artist,
        album: f.album,
        artwork: '',
        duration: f.durationMs / 1000,
        url: localPathToUri(f.path),
    }));
}

/** 本地文件 + tag 快照 → MusicItem */
export function toMusicItemFromLocalFile(
    path: string,
    tags: AudioTagSnapshot | null,
): MusicItem {
    const field = (key: string): string => tags?.fields[key]?.[0] ?? '';
    return withEmbeddedIdentity(path, tags?.fields.MF_MUSICITEM?.[0], () => ({
        ...localRefOfPath(path),
        title: field('TITLE') || fileStemOf(path),
        artist: field('ARTIST'),
        album: field('ALBUM'),
        artwork: '',
        duration: (tags?.durationMs ?? 0) / 1000,
        url: localPathToUri(path),
    }));
}

/**
 * 身份决策（两条转换路径共用，改这里就同时改了两边）
 *
 * 文件自带身份声明时以声明为准：同一个文件在本地库与在下载记录里必须是同一个媒体身份，
 * 否则收藏 / 播放历史 / 播放队列会按两个身份分裂成两份。
 * 声明同时提供插件侧的标题与封面 URL，比文件 tag 更完整；但时长以 TagLib 从当前文件实测的音频属性为准，
 * 仅在实测时长未知时沿用声明值
 */
function withEmbeddedIdentity(
    path: string,
    declaration: string | undefined,
    fallback: () => MusicItem,
): MusicItem {
    const localItem = fallback();
    const declared = declaration
        ? parseEmbeddedIdentity(declaration)
        : undefined;
    const measuredDuration = validDuration(localItem.duration);
    const declaredDuration = validDuration(declared?.duration);
    return {
        ...(declared ?? localItem),
        duration: measuredDuration ?? declaredDuration ?? 0,
        url: localPathToUri(path),
    };
}

/** 有效时长为有限正数；其余都表示未知 */
function validDuration(value: number | undefined): number | undefined {
    return value !== undefined && Number.isFinite(value) && value > 0
        ? value
        : undefined;
}

/** 路径 → 去目录、去扩展名的文件名 */
function fileStemOf(path: string): string {
    const base = path.slice(path.lastIndexOf('/') + 1);
    const dot = base.lastIndexOf('.');
    return dot < 0 ? base : base.slice(0, dot);
}

/** ScannedAudioFile → LocalFileMeta（addedAt 保留旧值、新文件用传入发现时刻；封面路径懒取故缺省） */
export function toFileMeta(
    f: ScannedAudioFile,
    prevAddedAt: number | undefined,
    discoveredAt: number,
    tagCharset: string,
): LocalFileMeta {
    return {
        mtimeMs: f.mtimeMs,
        sizeBytes: f.sizeBytes,
        addedAt: prevAddedAt ?? discoveredAt,
        hasCoverArt: f.hasCoverArt,
        albumArtist: f.albumArtist || f.artist,
        folderPath: f.folderPath,
        // 打戳「这条是按哪张码表读的」；只有真读过标签的文件才会走到这里
        tagCharset,
    };
}

/**
 * 从 files 指纹序列化 knownFingerprints（path→"mtime:size"），供原生增量跳过未变文件
 *
 * 码表与该条记录的 `tagCharset` 不同（**含缺失＝升级前入的库**）时，**只把那一条的值置空、
 * key 仍保留**：原生按 `"mtime:size"` 比对，空值一律不命中 → 那一条重读；而 key 仍参与
 * 它的删除结算（`removedPaths` 就是遍历这张表的 key 算的），直接把 key 删掉会丢一轮结算。
 *
 * 逐条判而不是整表一刀切：一轮里读失败或未挂载的文件不会被重读，整表切会把它们
 * 一并当成「已按新码表读过」；逐条判则它们保持失效、下次继续重试
 */
export function serializeKnownFingerprints(
    files: Record<string, LocalFileMeta>,
    tagCharset: string,
): string {
    const map: Record<string, string> = {};
    for (const [path, meta] of Object.entries(files)) {
        map[path] =
            meta.tagCharset === tagCharset
                ? `${meta.mtimeMs}:${meta.sizeBytes}`
                : '';
    }
    return JSON.stringify(map);
}
