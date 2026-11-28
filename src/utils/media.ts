import CryptoJS from 'crypto-js';

import type { MediaRef, MusicItem, QualityKey } from '@/types';

/** 本地媒体的 platform wire 值；legacy 数据与插件路由依赖此值，禁止修改 */
export const LOCAL_MEDIA_PLATFORM = '本地';

/**
 * 这个 platform 值是不是「本地」——即由内建本地插件提供、音源是本机文件路径
 *
 * 只回答**字段事实**，不替调用方下结论：由此推出的「下不了」「没有音质档可选」
 * 「不能收进 starred」各有各的上下文，留在各自调用点表达
 *
 * 与 `mediaMeta.hasLocalFile` 是两根不同的轴，名字里的 Platform / File 已点明差别：
 * 前者问身份字段，后者问设备上此刻有没有这个文件。下载来的歌前者为假、后者为真
 */
export function isLocalPlatform(platform: string | undefined): boolean {
    return platform === LOCAL_MEDIA_PLATFORM;
}

/**
 * 音质从低到高的排位：回退顺序与合法性校验的共同来源
 * 新增音质档需同步改此数组与 `QualityKey` 类型；UI 展示顺序另行决定，不必跟随此排位
 */
export const QUALITY_KEYS: readonly QualityKey[] = [
    'low',
    'standard',
    'high',
    'super',
];

const QUALITY_SET = new Set<string>(QUALITY_KEYS);

/** 是否合法音质档；校验不可信来源（持久化数据 / 插件返回） */
export function isQualityKey(value: unknown): value is QualityKey {
    return typeof value === 'string' && QUALITY_SET.has(value);
}

/**
 * `quality` 是否低于 `floor`（按 `QUALITY_KEYS` 排位）
 * 运行时任一方不在排位表内就返回 false，按「不低」处理：宁可不重下或继续使用本地文件，
 * 也不因无法识别的档位重复下载或消耗流量
 */
export function isQualityBelow(
    quality: QualityKey,
    floor: QualityKey,
): boolean {
    const a = QUALITY_KEYS.indexOf(quality);
    const b = QUALITY_KEYS.indexOf(floor);
    return a >= 0 && b >= 0 && a < b;
}

/**
 * 媒体唯一键：把 platform + id 编码成一个字符串，用作 Map 的键
 * 用 JSON 数组编码而不是 `platform@id` 拼接，避免字段里本身含分隔符时两首歌撞键
 */
export function mediaKey(ref: MediaRef): string {
    return JSON.stringify([ref.platform, ref.id]);
}

/** 两个媒体引用是否指向同一首（只看 platform + id，忽略其它字段） */
export function isSameMediaRef(a: MediaRef, b: MediaRef): boolean {
    return a.platform === b.platform && a.id === b.id;
}

/**
 * 媒体身份的定长十六进制摘要，用作按歌存文件时的文件名
 * 不能直接拿 id 当文件名：它的字符集由插件决定，可能含 `/`、超长或含控制字符
 * 输入取 mediaKey 而非拼接，沿用它「字段含分隔符也不撞键」的编码
 *
 * **输出是冻结的持久化契约**：自定义歌词等不可再生的文件按它命名，改算法或改
 * mediaKey 的编码都会让存量文件全部失联，还会被孤儿清理当成无主文件删掉。
 * 要改必须先写迁移，单测里锁了一个固定 ref 的精确摘要防误改
 */
export function mediaHash(ref: MediaRef): string {
    return CryptoJS.SHA256(mediaKey(ref)).toString();
}

/**
 * 将不可信来源（持久化数据或外部输入）规范为合法 MusicItem：platform 和 id 均不能为空
 * legacy 数字 id 统一转换为字符串，以满足 MediaRef.id 契约；无法规范化时返回 null
 * id 已是非空字符串时原样返回，避免不必要的复制
 */
export function coerceMusicItem(value: unknown): MusicItem | null {
    if (typeof value !== 'object' || value === null) {
        return null;
    }
    const { platform, id } = value as { platform?: unknown; id?: unknown };
    if (typeof platform !== 'string' || platform.length === 0) {
        return null;
    }
    if (typeof id === 'string' && id.length > 0) {
        return value as MusicItem;
    }
    if (typeof id === 'number' && Number.isFinite(id)) {
        return { ...(value as MusicItem), id: String(id) };
    }
    return null;
}

/** 裸本地路径 → file:// URI：已带 scheme 原样返回，否则每段 encodeURIComponent 编码（含 # ? % 空格 中文安全，media3 会解码） */
export function localPathToUri(path: string): string {
    if (/^[a-z]+:\/\//i.test(path)) {
        return path;
    }
    return `file://${path.split('/').map(encodeURIComponent).join('/')}`;
}

/** file:// URI → 裸本地路径：剥 file:// + 每段 decodeURIComponent（与 localPathToUri 对称）；非 file:// 原样返回 */
export function uriToLocalPath(uri: string): string {
    if (!uri.startsWith('file://')) {
        return uri;
    }
    return uri
        .slice('file://'.length)
        .split('/')
        .map(decodeURIComponent)
        .join('/');
}
