/**
 * 歌单自定义封面的托管文件机制（RNFS）
 * 只认 file:// 源，落地到 ${basePath}/playlist-artwork/<id>-<token>.<ext>
 * 策略：校验源可读 → 复制到临时文件 → 原子 move 成唯一名；失败抛错且不触碰旧封面
 * 不碰 MMKV / legacy / 摘要，删除为 best-effort
 */
import {
    copyFile,
    exists,
    mkdir,
    moveFile,
    stat,
    unlink,
} from '@dr.pogodin/react-native-fs';

import { basePath } from '@/infra/paths';

/** 托管封面目录 */
const ARTWORK_DIR = `${basePath}/playlist-artwork`;

/** 文件名 token 计数器，进程内单调递增，隔离同毫秒/并发保存 */
let tokenCounter = 0;

/**
 * 把 file:// 源封面持久化为该歌单的托管封面，返回托管 file:// 路径
 * 先校验源可读，复制到临时文件后原子 move 成 <id>-<token>.<ext>
 * 源不可读 / 复制 / move 失败都 reject，且不触碰任何旧封面
 * @param fileName picker 返回的原始文件名（含扩展名），缺省时从 sourceUri 推扩展名
 */
export async function persistArtwork(
    playlistId: string,
    sourceUri: string,
    fileName?: string,
): Promise<string> {
    const source = toFsPath(sourceUri);
    if (!(await exists(source)) || (await stat(source)).size <= 0) {
        throw new Error('封面源不可读或为空');
    }
    await ensureDir();
    const name = `${sanitizeStem(playlistId)}-${nextToken()}${resolveExtension(
        sourceUri,
        fileName,
    )}`;
    const dest = `${ARTWORK_DIR}/${name}`;
    const temp = `${ARTWORK_DIR}/.tmp-${name}`;
    try {
        await copyFile(source, temp);
        await moveFile(temp, dest);
    } catch (error) {
        await unlink(temp).catch(() => undefined);
        throw error;
    }
    return `file://${dest}`;
}

/**
 * best-effort 删除一个托管封面文件（reset 或删歌单）
 * 只删 ARTWORK_DIR 内的路径（越界即忽略），失败吞掉不抛，不回滚已提交的业务
 */
export async function removeArtwork(managedUri: string): Promise<void> {
    const path = toFsPath(managedUri);
    const prefix = `${ARTWORK_DIR}/`;
    if (!path.startsWith(prefix)) {
        return;
    }
    const name = path.slice(prefix.length);
    // 只删直接子文件：拒空名、. / .. 及任何含分隔符的穿越路径（installed RNFS unlink 会递归删目录）
    if (
        name.length === 0 ||
        name === '.' ||
        name === '..' ||
        name.includes('/') ||
        name.includes('\\')
    ) {
        return;
    }
    try {
        if (await exists(path)) {
            await unlink(path);
        }
    } catch {
        // 清理失败不影响已提交的业务
    }
}

/** 确保托管目录存在（首次运行时还没建） */
async function ensureDir(): Promise<void> {
    if (!(await exists(ARTWORK_DIR))) {
        await mkdir(ARTWORK_DIR);
    }
}

/**
 * file:// URI → RNFS 用的裸路径
 * 剥 #fragment（legacy addRandomHash 追加 #<ts>）、剥 ?query、剥 file:// scheme
 */
function toFsPath(uri: string): string {
    let path = uri;
    const hash = path.indexOf('#');
    if (hash >= 0) {
        path = path.slice(0, hash);
    }
    const query = path.indexOf('?');
    if (query >= 0) {
        path = path.slice(0, query);
    }
    return path.startsWith('file://') ? path.slice('file://'.length) : path;
}

/** 每次调用都不同的文件名 token：时钟隔离不同会话，计数器隔离同一会话（含同毫秒/并发） */
function nextToken(): string {
    tokenCounter += 1;
    return `${Date.now().toString(36)}-${tokenCounter.toString(36)}`;
}

/**
 * 推小写扩展名（含前导点）：优先原始 fileName，回退 sourceUri，无有效扩展名返回空串
 * fileName 是 picker 显示名（可能含 # 等合法字符），按文件名直接取；sourceUri 先剥 #/? 再取
 */
function resolveExtension(sourceUri: string, fileName?: string): string {
    const fromName = fileName ? extensionOf(baseName(fileName)) : '';
    return fromName || extensionOf(baseName(toFsPath(sourceUri)));
}

/** 从单个文件名取小写扩展名（含前导点），无有效扩展名返回空串 */
function extensionOf(name: string): string {
    const dot = name.lastIndexOf('.');
    if (dot <= 0 || dot === name.length - 1) {
        return '';
    }
    const ext = name.slice(dot + 1).toLowerCase();
    return /^[a-z0-9]+$/.test(ext) ? `.${ext}` : '';
}

/** 取路径最后一段（兼容 / 与 \\） */
function baseName(path: string): string {
    const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    return slash >= 0 ? path.slice(slash + 1) : path;
}

/** 歌单 id → 文件名安全的 stem（非 [A-Za-z0-9_-] 替为 _） */
function sanitizeStem(id: string): string {
    return id.replace(/[^A-Za-z0-9_-]/g, '_');
}
