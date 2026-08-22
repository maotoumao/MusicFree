/**
 * Mp3Util 的桌面实现:读取/写入音乐元数据
 * 读取:music-metadata;写入:node-id3
 */
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { app } from "electron";

export interface IBasicMeta {
    album?: string;
    artist?: string;
    author?: string;
    duration?: string;
    title?: string;
}

export interface IWritableMeta extends IBasicMeta {
    lyric?: string;
    comment?: string;
}

function normalize(p: string): string {
    if (typeof p === "string" && p.startsWith("file://")) {
        return decodeURIComponent(p.slice("file://".length));
    }
    return p;
}

function coverCacheDir(): string {
    return path.join(app.getPath("userData"), "cache", "covers");
}

async function parseMeta(filePath: string) {
    const musicMetaData = await import("music-metadata");
    return musicMetaData.parseFile(filePath, { duration: true });
}

async function readBasicMeta(filePath: string): Promise<IBasicMeta> {
    const meta = await parseMeta(filePath);
    const common = meta.common ?? ({} as any);
    const artist =
        common.artist ||
        (Array.isArray(common.artists) && common.artists.join(", ")) ||
        "";
    return {
        title: common.title || undefined,
        artist: artist || undefined,
        author: (common as any).composer?.[0] || artist || undefined,
        album: common.album || undefined,
        duration: meta.format?.duration
            ? String(Math.round(meta.format.duration * 1000))
            : undefined,
    };
}

export async function getBasicMeta(fileName: string): Promise<IBasicMeta> {
    return readBasicMeta(normalize(fileName));
}

export async function getMediaMeta(
    fileNames: string[],
): Promise<IBasicMeta[]> {
    const result: IBasicMeta[] = [];
    for (const file of fileNames) {
        try {
            result.push(await readBasicMeta(normalize(file)));
        } catch {
            result.push({});
        }
    }
    return result;
}

/** 返回封面图 URL(musicfree-local 协议,指向提取后的缓存文件) */
export async function getMediaCoverImg(mediaPath: string): Promise<string> {
    const filePath = normalize(mediaPath);
    const meta = await parseMeta(filePath);
    const picture = meta.common?.picture?.[0];
    if (!picture) {
        return "";
    }
    const buffer = picture.data as Buffer;
    const ext = (picture.format || "image/jpeg").split("/").pop() || "jpg";
    const hash = crypto
        .createHash("md5")
        .update(buffer)
        .digest("hex")
        .slice(0, 16);
    const dir = coverCacheDir();
    fs.mkdirSync(dir, { recursive: true });
    const coverPath = path.join(dir, `${hash}.${ext}`);
    if (!fs.existsSync(coverPath)) {
        fs.writeFileSync(coverPath, buffer);
    }
    return `musicfree-local://p/${encodeURIComponent(coverPath)}`;
}

/** 读取内嵌歌词 */
export async function getLyric(mediaPath: string): Promise<string> {
    const filePath = normalize(mediaPath);
    // 优先用 node-id3 读 ID3 标签(带同步歌词)
    try {
        const NodeID3 = await import("node-id3");
        const tags = NodeID3.read(filePath);
        const lyric = (tags as any)?.userDefinedText?.find(
            (t: any) => t?.description === "lyric",
        )?.value;
        if (lyric) return lyric as string;
        if ((tags as any)?.lyrics) {
            return Array.isArray((tags as any).lyrics)
                ? (tags as any).lyrics.join("\n")
                : String((tags as any).lyrics);
        }
    } catch {
        // 继续 music-metadata
    }
    const meta = await parseMeta(filePath);
    const common = meta.common as any;
    if (Array.isArray(common.lyrics) && common.lyrics.length) {
        return common.lyrics.join("\n");
    }
    return "";
}

export async function getMediaTag(filePath: string): Promise<IWritableMeta> {
    const target = normalize(filePath);
    const basic = await readBasicMeta(target);
    let lyric = "";
    let comment = "";
    try {
        const NodeID3 = await import("node-id3");
        const tags: any = NodeID3.read(target);
        lyric =
            tags?.userDefinedText?.find((t: any) => t?.description === "lyric")
                ?.value ?? "";
        if (!lyric && tags?.lyrics) {
            lyric = Array.isArray(tags.lyrics)
                ? tags.lyrics.join("\n")
                : String(tags.lyrics);
        }
        comment = tags?.comment?.text ?? "";
    } catch {
        // ignore
    }
    return { ...basic, lyric, comment };
}

export async function setMediaTag(
    filePath: string,
    meta: IWritableMeta,
): Promise<void> {
    const target = normalize(filePath);
    const NodeID3 = await import("node-id3");
    const tags: any = {};
    if (meta.title) tags.title = meta.title;
    if (meta.artist) tags.artist = meta.artist;
    if (meta.author) tags.composer = meta.author;
    if (meta.album) tags.album = meta.album;
    if (meta.lyric) {
        tags.userDefinedText = [
            { description: "lyric", value: meta.lyric },
        ];
    }
    if (meta.comment) {
        tags.comment = { language: "chi", text: meta.comment };
    }
    NodeID3.update(tags, target);
}
