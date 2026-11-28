import { CachesDirectoryPath, exists } from '@dr.pogodin/react-native-fs';

import Native, {
    type AudioTagPatch as NativeAudioTagPatch,
    type AudioTagSnapshot as NativeAudioTagSnapshot,
} from '@/native/specs/NativeAudioTags';
import { localPathToUri } from '@/utils/media';

/**
 * 音频文件 tag 读写：领域无关的平台能力，薄封装原生 TagLib 桥
 * 错误双通道：预期失败（原生返回的 status 非成功）抛 TagError；未预期的桥故障
 * （marshalling / 原生异常 / iOS stub）原样传播原始 rejection，调用方应视为不可重试
 * 无状态，直接导出函数（不经过 core 的 DI 装配）
 *
 * @example
 * import { readTags, writeTags } from '@/infra/audioTags';
 *
 * const info = await readTags('/sdcard/Music/a.mp3');
 * console.log(info.fields.TITLE?.[0], info.durationMs);
 *
 * await writeTags('/sdcard/Music/a.mp3', {
 *     setFields: { TITLE: ['新标题'], ARTIST: ['歌手'] },
 *     cover: { op: 'replace', imagePath: '/sdcard/cover.jpg' },
 * });
 */

/** 原生 tag 状态码（wire 契约，值须与 Kotlin AudioTagStore.TagStatus / TagLibNative 对齐） */
export enum AudioTagStatus {
    Ok = 0,
    NotOpen = 1,
    Unsupported = 2,
    FieldsRejected = 3,
    Io = 4,
    InvalidArg = 5,
    NotFound = 100,
    Permission = 101,
    NotWritable = 102,
    RecoveryFailed = 103,
}

/** 读到的 tag 与技术属性 */
export interface AudioTagSnapshot {
    /** 大写 key、Unicode 多值（TITLE/ARTIST/ALBUM…） */
    fields: Record<string, string[]>;
    /** 时长（毫秒） */
    durationMs: number;
    /** 码率（kbps） */
    bitrateKbps: number;
    /** 采样率（Hz，如 44100） */
    sampleRateHz: number;
    /** 声道数（1=单声道，2=立体声） */
    channels: number;
    /** 是否内嵌封面 */
    hasCoverArt: boolean;
}

/** 写后回读结果：快照 + 部分字段是否被格式拒绝 */
export interface AudioTagWriteResult extends AudioTagSnapshot {
    /** true = 部分字段这个格式存不下，受支持子集已写入、其余被丢弃 */
    fieldsRejected: boolean;
}

/**
 * 封面编辑意图（用于写入 patch）：`unchanged` 保持不变（默认）/ `remove` 删除 /
 * `replace` 替换为 `imagePath` 指向的图片；图片字节仅在原生侧处理，不经过 JS 桥
 */
export type CoverEdit =
    | { op: 'unchanged' }
    | { op: 'remove' }
    | { op: 'replace'; imagePath: string };

/** 写入补丁（稀疏）：省略的部分保持不变 */
export interface AudioTagPatch {
    /** 覆盖指定 key 的值（大写 key、多值，例如 `{ TITLE: ['x'] }`） */
    setFields?: Record<string, string[]>;
    /** 删除这些 key */
    removeFields?: string[];
    /** 封面编辑，省略时保持不变 */
    cover?: CoverEdit;
}

/** 提取出的封面文件 */
export interface ExtractedCover {
    /** 已写入的本地文件路径，与传入的 destPath 相同 */
    path: string;
    /** 图片 MIME（如 image/jpeg） */
    mime: string;
    /** 字节数 */
    byteCount: number;
}

/**
 * tag 操作失败：`status` 为原生返回的状态码（读取/提取封面非 `Ok`、写入非 `Ok`/`FieldsRejected` 时抛出）
 * 调用方 `catch` 后可根据 `err.status`（参见 {@link AudioTagStatus}）和错误上下文决定是否重试
 */
export class TagError extends Error {
    readonly status: AudioTagStatus;

    constructor(status: AudioTagStatus) {
        super(`audio tag op failed with status ${status}`);
        this.name = 'TagError';
        this.status = status;
    }
}

function ensureOk(status: number, allowFieldsRejected = false): void {
    if (status === AudioTagStatus.Ok) {
        return;
    }
    if (allowFieldsRejected && status === AudioTagStatus.FieldsRejected) {
        return;
    }
    throw new TagError(status);
}

function toSnapshot(s: NativeAudioTagSnapshot): AudioTagSnapshot {
    return {
        fields: s.fields,
        durationMs: s.durationMs,
        bitrateKbps: s.bitrateKbps,
        sampleRateHz: s.sampleRateHz,
        channels: s.channels,
        hasCoverArt: s.hasCoverArt,
    };
}

function toNativePatch(patch: AudioTagPatch): NativeAudioTagPatch {
    const cover: CoverEdit = patch.cover ?? { op: 'unchanged' };
    return {
        setFields: patch.setFields ?? {},
        removeFields: patch.removeFields ?? [],
        cover:
            cover.op === 'replace'
                ? { op: 'replace', imagePath: cover.imagePath }
                : { op: cover.op },
    };
}

/** 当前平台是否提供 TagLib（仅 Android；iOS 未实现，调用前守卫） */
export const isAudioTagsSupported = Native != null;

/** 守卫：不支持平台调用时明确报错（而非 Native null 静默崩）；resolveCover 等的 try/catch 会吞成降级 */
function required(): NonNullable<typeof Native> {
    if (Native == null) {
        throw new Error('[AudioTags] 音频标签读写在当前平台不可用');
    }
    return Native;
}

/**
 * 读取文件的 tag 和技术属性
 *
 * @param fileLocation 目标音频文件：绝对路径 / `file://` / SAF `content://` URI
 * @returns tag 字段（大写 key、多值）以及时长、码率、采样率、声道数和封面状态
 * @throws {TagError} 带内失败（如 `NotFound`/`Permission`/`Unsupported`），`status` 参见 {@link AudioTagStatus}；桥故障（marshalling / iOS stub）原样抛出
 */
export async function readTags(
    fileLocation: string,
): Promise<AudioTagSnapshot> {
    const s = await required().readTags(fileLocation);
    ensureOk(s.status);
    return toSnapshot(s);
}

/**
 * 写入 tag 和封面（稀疏补丁：只修改 `patch` 提供的部分）
 *
 * @param fileLocation 目标音频文件：绝对路径 / `file://` / SAF `content://` URI
 * @param patch 要修改的字段或封面；空补丁（全部省略）不会写入，仅执行回读
 * @returns 写入后的回读结果；`fieldsRejected` 为 true 表示部分字段无法由该格式存储，已按受支持的字段子集写入
 * @throws {TagError} 带内失败（如 `Permission`/`NotWritable`/`InvalidArg`），`status` 参见 {@link AudioTagStatus}；桥故障原样抛出
 */
export async function writeTags(
    fileLocation: string,
    patch: AudioTagPatch,
): Promise<AudioTagWriteResult> {
    const s = await required().writeTags(fileLocation, toNativePatch(patch));
    ensureOk(s.status, true);
    return {
        ...toSnapshot(s),
        fieldsRejected: s.status === AudioTagStatus.FieldsRejected,
    };
}

/**
 * 将主封面（优先选择 Front Cover，否则选择第一张）提取到本地文件
 *
 * @param fileLocation 源音频文件：绝对路径 / `file://` / SAF `content://` URI
 * @param destPath 封面输出的本地文件路径；不可等于源文件（否则 `InvalidArg`）
 * @returns 已写入的封面文件（路径、MIME、字节数）；文件无封面时返回 `null`
 * @throws {TagError} 带内失败，`status` 参见 {@link AudioTagStatus}；桥故障原样抛出
 */
export async function extractCover(
    fileLocation: string,
    destPath: string,
): Promise<ExtractedCover | null> {
    const r = await required().extractPrimaryCover(fileLocation, destPath);
    ensureOk(r.status);
    if (!r.path) {
        return null; // status OK 但无封面
    }
    return { path: r.path, mime: r.mime, byteCount: r.byteCount };
}

/** 本地封面缓存路径（约定：id → 缓存目录/localCover_&lt;id&gt;.jpg） */
function localCoverPath(id: string): string {
    return `${CachesDirectoryPath}/localCover_${id}.jpg`;
}

/** 同 id 在途 extract 的去重表（settle 即删）：防重复原生提取 + 同一 destPath 并发写竞争 */
const inflightCovers = new Map<string, Promise<string | null>>();

/**
 * 惰性解析本地音频封面 → 可显示 uri（无封面 / 失败 → null）
 * 缓存约定路径 + exists 为单一真相源：系统清缓存后自愈重提；不缓存结果、不在文件系统外造第二真相源
 * 同 id 在途去重（防重复提取与并发写同一文件）；hasCoverArt 缺省 true（无该信息时总试），传 false 跳过无谓 extract
 */
export function resolveCover(
    id: string,
    fileLocation: string,
    hasCoverArt = true,
): Promise<string | null> {
    const destPath = localCoverPath(id);
    const existing = inflightCovers.get(id);
    if (existing) {
        return existing; // 已有提取任务在途 → 复用（不论本次 hasCoverArt）
    }
    // hasCoverArt=false（弱提示：认为无内嵌封面）→ 只查缓存、不提取、不登记在途
    // 否则先到的弱提示会压掉并发的强制提取（true）；也不占 in-flight 表
    if (!hasCoverArt) {
        return readCachedCover(destPath);
    }
    // hasCoverArt=true → 创建提取任务并登记（同一 destPath 单 writer、防并发写竞争）
    const task = (async (): Promise<string | null> => {
        try {
            if (await exists(destPath)) {
                return localPathToUri(destPath);
            }
            const cover = await extractCover(fileLocation, destPath);
            return cover ? localPathToUri(cover.path) : null;
        } catch {
            return null;
        } finally {
            // settle 即从在途表删除——不缓存结果、下次仍走 exists（保持自愈）
            inflightCovers.delete(id);
        }
    })();
    inflightCovers.set(id, task);
    return task;
}

/** 只读缓存封面、不提取（hasCoverArt=false 的弱提示路径） */
async function readCachedCover(destPath: string): Promise<string | null> {
    try {
        return (await exists(destPath)) ? localPathToUri(destPath) : null;
    } catch {
        return null;
    }
}
