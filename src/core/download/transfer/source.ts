/**
 * 把「一首歌 + 想要的音质」解析成「一条现在能下的直链」
 *
 * 只管「能不能拿到源」，不管「什么时候拿」也不管拿到之后干什么：无状态、不碰队列。
 * 插件是第三方 JS，故本模块只做归一化与逐档回退；**超时由调度方负责**（唯一超时所有者）
 */
import { cloneJson } from '@/utils/json';
import { isQualityKey, QUALITY_KEYS } from '@/utils/media';

import type { DownloadSource } from './types';
import type { Plugin } from '@/core/plugin';
import type { DeepReadonly, MediaSource, MusicItem, QualityKey } from '@/types';

/**
 * 音质回退顺序：从目标开始，按方向（asc=优先更高、desc=优先更低）依次尝试
 * 例：目标 standard、asc → [standard, high, super, low]
 */
export function getQualityFallbackOrder(
    target: QualityKey,
    direction: 'asc' | 'desc',
): QualityKey[] {
    const t = QUALITY_KEYS.indexOf(target);
    if (t < 0) {
        return [...QUALITY_KEYS];
    }
    const higher = QUALITY_KEYS.slice(t + 1); // 比目标高，升序
    const lower = QUALITY_KEYS.slice(0, t).reverse(); // 比目标低，降序（就近优先）
    return direction === 'asc'
        ? [target, ...higher, ...lower]
        : [target, ...lower, ...higher];
}

/**
 * 下载源解析：按下载音质回退调 `plugin.getMediaSource`，取首个可下载候选（http(s) progressive 直链）
 * 每个候选统一归一化（校验/复制 headers、并入 userAgent、采信插件声明的实际音质）；无效候选跳过继续回退，
 * getMediaSource 抛错视为该档无源；全部失败返 null
 * 注：单次调用与整次回退的超时由 B5 调度统一负责（唯一超时所有者），此处不另计时
 * 注：URL 内嵌 basic auth 归一化（player 有）属边缘场景，B3 暂未做，需要时后续补
 */
export async function resolveDownloadSource(
    plugin: Plugin,
    music: DeepReadonly<MusicItem>,
    target: QualityKey,
    direction: 'asc' | 'desc',
): Promise<DownloadSource | null> {
    // 传一次性普通快照给插件，避免插件原地修改污染 registry 持有的真相源；不可序列化则无法安全解析
    const snapshot = cloneJson(music) as MusicItem | undefined;
    if (!snapshot) {
        return null;
    }
    for (const quality of getQualityFallbackOrder(target, direction)) {
        const ms = await plugin.methods
            .getMediaSource(snapshot, quality)
            .catch(() => null);
        const source = normalizeSource(ms, quality);
        if (source) {
            return source;
        }
    }
    return null;
}

/** 把插件候选归一为可下载源；非法（非字符串 url / 非 http(s) / HLS·DASH）返回 null */
function normalizeSource(
    ms: MediaSource | null,
    requested: QualityKey,
): DownloadSource | null {
    const url = typeof ms?.url === 'string' ? ms.url.trim() : '';
    if (!url || !isDownloadableHttpUrl(url)) {
        return null;
    }

    const headers: Record<string, string> = {};
    if (ms?.headers) {
        for (const [k, v] of Object.entries(ms.headers)) {
            if (typeof v === 'string') {
                headers[k] = v; // 校验 + 复制，切断对插件对象的可变引用
            }
        }
    }
    if (
        typeof ms?.userAgent === 'string' &&
        ms.userAgent &&
        !hasHeaderCI(headers, 'user-agent')
    ) {
        headers['User-Agent'] = ms.userAgent; // 并入，供仅靠 UA 防盗链的源
    }

    // 采信插件声明的实际命中音质（校验属于 QualityKey），否则回退请求档
    const resolvedQuality = isQualityKey(ms?.quality) ? ms.quality : requested;
    return { url, headers, resolvedQuality };
}

/** 是否可下载的 http(s) progressive 直链：http(s) scheme + 后缀非 HLS/DASH（剥 query/fragment 后判） */
function isDownloadableHttpUrl(url: string): boolean {
    const lower = url.toLowerCase();
    if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
        return false;
    }
    const clean = lower.split('#')[0]?.split('?')[0] ?? '';
    return !clean.endsWith('.m3u8') && !clean.endsWith('.mpd');
}

/** 某 header 是否已存在（大小写不敏感） */
function hasHeaderCI(headers: Record<string, string>, name: string): boolean {
    const lower = name.toLowerCase();
    return Object.keys(headers).some(k => k.toLowerCase() === lower);
}
