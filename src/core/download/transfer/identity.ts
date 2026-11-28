/**
 * 一次下载该叫什么名字：从「哪首歌 + 哪个音质档」算出各种键与文件名
 *
 * 两类名字受众不同，但都只依赖同一组输入，故归一处：
 * - 给机器的：`contentKey`（字节身份，同时充当 taskId）、`stagingKey`（`.part` 文件名基）
 * - 给人看的：`finalName`（发布后的文件名）
 *
 * 全是纯函数、不碰存储。算法尚未冻结（将来可能把源变体纳入 `contentKey`），
 * 所以调用方拿到后必须把结果**记下来**（见 `TransferIdentity`），不能事后按当前算法重算
 */
import CryptoJS from 'crypto-js';

import { mediaKey } from '@/utils/media';
import { firstNonBlank, sanitizeFileName } from '@/utils/text';

import type { MediaRef, MusicItem, QualityKey } from '@/types';

/**
 * finalName 的 UTF-8 字节预算：文件名单段上限约 255 字节，扣掉扩展名（`.flac`）与冲突重命名
 * 后缀（` (9999)`）后保守取 240，避免发布时 ENAMETOOLONG
 */
const MAX_FINAL_NAME_BYTES = 240;

/**
 * contentKey：绑 `.part` 的字节身份 = SHA256(mediaKey :: quality)
 * 当前是「逻辑字节身份」——同一首歌同一音质档假定同字节；真正的字节校验（ETag / If-Range）
 * 由原生负责（尚未实现），届时可能把音源变体纳入本算法，故算法不冻结
 * 正因为会变，算出的值必须随 `TransferIdentity` 落库：日后拿新算法重算会对不上盘上的旧文件
 */
export function contentKeyOf(ref: MediaRef, quality: QualityKey): string {
    return CryptoJS.SHA256(`${mediaKey(ref)}::${quality}`).toString();
}

/**
 * stagingKey：`.part` 临时文件名基；contentKey 已是 SHA256 hex（天然安全文件名），直接复用
 *
 * 这个形态被原生的孤儿清理当作**所属判据**（只删 `<64 位小写 hex>.part`）——落盘目录可以是
 * 用户自选的公共目录，那里的 `.part` 未必是我们的。改这里的算法要同步改
 * `DownloadEngine.kt` 的 OUR_PART_NAME
 */
export function stagingKeyOf(contentKey: string): string {
    return contentKey;
}

/**
 * finalName：用户友好文件名 `title - artist`（不含扩展名，扩展名由 native 嗅探定）
 * 经通用 sanitizeFileName 消毒 + 按 UTF-8 字节截断；结果为空（含脏数据 / `.` / `..`）回退 `download`
 */
export function finalNameOf(item: MusicItem): string {
    const title = firstNonBlank(item.title) ?? '';
    const artist = firstNonBlank(item.artist) ?? '';
    const base = artist ? `${title} - ${artist}` : title;
    return sanitizeFileName(base, MAX_FINAL_NAME_BYTES) || 'download';
}
