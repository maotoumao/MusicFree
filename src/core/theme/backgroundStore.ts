import {
    copyFile,
    exists,
    mkdir,
    moveFile,
    readDir,
    stat,
    unlink,
    writeFile,
} from '@dr.pogodin/react-native-fs';
import { v4 as uuidv4 } from 'uuid';

import { basePath } from '@/infra/paths';
import { localPathToUri, uriToLocalPath } from '@/utils/media';
import { utf8ByteLength } from '@/utils/text';

/** 主题目录扫描结论；目录不可读时结论不可信，调用方不得据此修复 */
interface BackgroundReconcilePlan {
    readonly readable: boolean;
    /** 被偏好引用、但目录中确定不存在的文件 */
    readonly missingFileNames: readonly string[];
    /** 目录中不被任何偏好引用的托管文件与临时文件 */
    readonly staleFileNames: readonly string[];
}

const BACKGROUND_DIR = `${basePath}/theme-background`;
const FILE_NAME_MAX_BYTES = 255;
const EXTENSION_MAX_LENGTH = 10;
/** 烘焙位图固定编码为 JPEG：全屏照片体积远小于 PNG */
const BITMAP_EXTENSION = '.jpg';
const UUID_V4 =
    '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
/** background- 为烘焙位图，source- 为用户原图；legacy 单背景文件同属 background- 形状，无引用即作废弃清理 */
const MANAGED_FILE_NAME = new RegExp(
    `^(?:background|source)-${UUID_V4}(?:\\.[a-z0-9]{1,${EXTENSION_MAX_LENGTH}})?$`,
);
const TEMPORARY_FILE_NAME = new RegExp(
    `^\\.tmp-(?:background|source)-${UUID_V4}(?:\\.[a-z0-9]{1,${EXTENSION_MAX_LENGTH}})?$`,
);

/**
 * 把 picker 缓存中的 file:// 原图复制到主题托管目录，返回直属文件名
 * 源校验、临时复制或同目录 move 任一步失败都会 reject，并尽力清理临时文件
 */
async function persistBackgroundSource(
    sourceUri: string,
    originalName?: string,
): Promise<string> {
    const source = toFilePath(sourceUri);
    if (!(await exists(source)) || (await stat(source)).size <= 0) {
        throw new Error('背景图片源不可读或为空');
    }
    const fileName = `source-${uuidv4()}${resolveExtension(
        sourceUri,
        originalName,
    )}`;
    return publishFile(fileName, temporary =>
        copyFile(source, temporary).then(() => undefined),
    );
}

/** 把已烘焙的位图（JPEG base64）写入主题托管目录，返回直属文件名 */
async function persistBackgroundBitmap(base64: string): Promise<string> {
    if (base64.length === 0) {
        throw new Error('背景位图内容为空');
    }
    const fileName = `background-${uuidv4()}${BITMAP_EXTENSION}`;
    return publishFile(fileName, temporary =>
        writeFile(temporary, base64, 'base64').then(() => undefined),
    );
}

/** best-effort 删除托管目录内的直属文件；不安全文件名与目录外路径直接忽略 */
async function removeBackgroundImage(fileName: string): Promise<void> {
    if (!isSafeBackgroundImageFileName(fileName)) {
        return;
    }
    const path = `${BACKGROUND_DIR}/${fileName}`;
    try {
        if (await exists(path)) {
            await unlink(path);
        }
    } catch {
        // 文件清理失败不应回滚已经完成的业务提交
    }
}

/** 托管文件名转可渲染的 file:// URI；非法文件名返回 undefined */
function resolveBackgroundImageUri(fileName: string): string | undefined {
    return isSafeBackgroundImageFileName(fileName)
        ? localPathToUri(`${BACKGROUND_DIR}/${fileName}`)
        : undefined;
}

/**
 * 扫描主题背景目录：报告被引用但缺失的文件，以及不再被引用的托管 / 临时文件
 * 扫描阶段不删除文件，调用方复核持久化引用与版本后再执行清理
 */
async function scanBackgroundImages(
    referencedFileNames: ReadonlySet<string>,
): Promise<BackgroundReconcilePlan> {
    let entries;
    try {
        if (!(await exists(BACKGROUND_DIR))) {
            return {
                readable: true,
                missingFileNames: [...referencedFileNames],
                staleFileNames: [],
            };
        }
        entries = await readDir(BACKGROUND_DIR);
    } catch {
        return { readable: false, missingFileNames: [], staleFileNames: [] };
    }

    const presentFileNames = new Set<string>();
    const staleFileNames: string[] = [];
    for (const entry of entries) {
        if (!entry.isFile()) {
            continue;
        }
        if (referencedFileNames.has(entry.name)) {
            presentFileNames.add(entry.name);
            continue;
        }
        if (
            TEMPORARY_FILE_NAME.test(entry.name) ||
            MANAGED_FILE_NAME.test(entry.name)
        ) {
            staleFileNames.push(entry.name);
        }
    }
    return {
        readable: true,
        missingFileNames: [...referencedFileNames].filter(
            fileName => !presentFileNames.has(fileName),
        ),
        staleFileNames,
    };
}

/** 按扫描计划 best-effort 清理目录中的候选文件；每个删除前复核计划仍有效 */
async function cleanupBackgroundImages(
    fileNames: readonly string[],
    isPlanCurrent: () => boolean,
): Promise<void> {
    for (const fileName of fileNames) {
        if (!isPlanCurrent()) {
            return;
        }
        if (
            !TEMPORARY_FILE_NAME.test(fileName) &&
            !MANAGED_FILE_NAME.test(fileName)
        ) {
            continue;
        }
        await unlink(`${BACKGROUND_DIR}/${fileName}`).catch(() => undefined);
    }
}

/** 先写同目录临时文件再 move 到目的地：目的文件要么不存在、要么内容完整 */
async function publishFile(
    fileName: string,
    write: (temporaryPath: string) => Promise<void>,
): Promise<string> {
    await ensureDirectory();
    const destination = `${BACKGROUND_DIR}/${fileName}`;
    const temporary = `${BACKGROUND_DIR}/.tmp-${fileName}`;
    try {
        await write(temporary);
        await moveFile(temporary, destination);
    } catch (error) {
        await unlink(temporary).catch(() => undefined);
        throw error;
    }
    return fileName;
}

async function ensureDirectory(): Promise<void> {
    if (!(await exists(BACKGROUND_DIR))) {
        await mkdir(BACKGROUND_DIR);
    }
}

/** 只接受本地 file:// URI（picker 缓存或本目录已托管的原图） */
function toFilePath(uri: string): string {
    if (!uri.startsWith('file://')) {
        throw new TypeError('背景图片源必须是 file:// URI');
    }
    const path = uriToLocalPath(stripUriSuffix(uri));
    if (!path) {
        throw new TypeError('背景图片源路径不能为空');
    }
    return path;
}

function resolveExtension(sourceUri: string, originalName?: string): string {
    const fromName = originalName ? extensionOf(baseName(originalName)) : '';
    return fromName || extensionOf(baseName(stripUriSuffix(sourceUri)));
}

function extensionOf(fileName: string): string {
    const dot = fileName.lastIndexOf('.');
    if (dot <= 0 || dot === fileName.length - 1) {
        return '';
    }
    const extension = fileName.slice(dot + 1).toLowerCase();
    return extension.length <= EXTENSION_MAX_LENGTH &&
        /^[a-z0-9]+$/.test(extension)
        ? `.${extension}`
        : '';
}

function stripUriSuffix(uri: string): string {
    const hash = uri.indexOf('#');
    const query = uri.indexOf('?');
    const end = Math.min(
        hash < 0 ? uri.length : hash,
        query < 0 ? uri.length : query,
    );
    return uri.slice(0, end);
}

function baseName(path: string): string {
    const separator = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    return separator >= 0 ? path.slice(separator + 1) : path;
}

function isSafeBackgroundImageFileName(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        value.length > 0 &&
        utf8ByteLength(value) <= FILE_NAME_MAX_BYTES &&
        value !== '.' &&
        value !== '..' &&
        !value.startsWith('.') &&
        !value.includes('/') &&
        !value.includes('\\') &&
        !hasControlCharacter(value)
    );
}

function hasControlCharacter(value: string): boolean {
    for (const character of value) {
        const codePoint = character.codePointAt(0)!;
        if (
            codePoint <= 0x1f ||
            (codePoint >= 0x7f && codePoint <= 0x9f) ||
            (codePoint >= 0xd800 && codePoint <= 0xdfff)
        ) {
            return true;
        }
    }
    return false;
}

export {
    cleanupBackgroundImages,
    isSafeBackgroundImageFileName,
    persistBackgroundBitmap,
    persistBackgroundSource,
    removeBackgroundImage,
    resolveBackgroundImageUri,
    scanBackgroundImages,
};
export type { BackgroundReconcilePlan };
