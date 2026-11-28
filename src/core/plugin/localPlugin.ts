/**
 * 内建「本地」插件
 * 本地 / 下载音乐的 platform = "本地"，getByMediaItem 路由到此，让本地歌走与网络插件同一条
 * getMediaSource / getLyric / getMusicInfo 路径，业务层无需到处特判本地文件
 *
 * 不进注册表、不可装卸、恒可用；definition 用 item.url（编码 file://）+ infra/audioTags 读内嵌 tag/封面 + 旁挂 .lrc
 */
import { exists, readFile } from '@dr.pogodin/react-native-fs';

import { readTags, resolveCover } from '@/infra/audioTags';
import { LOCAL_MEDIA_PLATFORM, uriToLocalPath } from '@/utils/media';

import { buildMethods } from './methods';

import type { Plugin, PluginMethods } from './types';
import type {
    MediaSource,
    MusicItem,
    PluginDefinition,
    RawLyric,
} from '@/types';

/** 内建本地插件的 platform，沿用本地媒体的 wire 值（判定走 utils 的 isLocalPlatform） */
const localPluginPlatform = LOCAL_MEDIA_PLATFORM;
/** 内容身份：内建插件固定 hash（wire 冻结值，勿改） */
export const localPluginHash = 'local-plugin-hash';

/**
 * 本地插件 definition：本地文件音源 / 内嵌+旁挂歌词 / 封面补全
 * methods 走共用 buildMethods 委托 definition
 */
const localDefinition: PluginDefinition = {
    platform: localPluginPlatform,
    // 本地文件音源：item.url 恒为扫描写入的编码 file://path，直接返回；无 url 则不可播
    getMediaSource(item: MusicItem): Promise<MediaSource | null> {
        return Promise.resolve(item.url ? { url: item.url } : null);
    },
    getLyric(item: MusicItem): Promise<RawLyric | null> {
        return getLocalLyric(item);
    },
    getMusicInfo(item: MusicItem): Promise<Partial<MusicItem> | null> {
        return getLocalMusicInfo(item);
    },
};

/** 歌词：同名旁挂 .lrc 优先（用户手动放的覆盖内嵌），否则读内嵌 LYRICS */
async function getLocalLyric(item: MusicItem): Promise<RawLyric | null> {
    const uri = item.url;
    if (!uri) {
        return null;
    }
    const path = uriToLocalPath(uri);
    // 换 basename 最后一段扩展名为 .lrc；无扩展名则追加（避免 replace 不匹配时 lrcPath===path 读到原音频）
    const dot = path.lastIndexOf('.');
    const slash = path.lastIndexOf('/');
    const lrcPath = dot > slash ? `${path.slice(0, dot)}.lrc` : `${path}.lrc`;
    try {
        if (await exists(lrcPath)) {
            const rawLrc = await readFile(lrcPath, 'utf8');
            if (rawLrc.trim()) {
                return { rawLrc };
            }
        }
    } catch {
        // 旁挂读失败 → 落内嵌
    }
    try {
        const snapshot = await readTags(uri);
        const embedded = snapshot.fields.LYRICS?.[0];
        if (embedded?.trim()) {
            return { rawLrc: embedded };
        }
    } catch {
        // 无 tag / 读失败
    }
    return null;
}

/** 补全：本地歌扫描已有 title/artist/album/duration，此处主要提内嵌封面 → artwork（懒取、按 id 缓存复用） */
async function getLocalMusicInfo(
    item: MusicItem,
): Promise<Partial<MusicItem> | null> {
    if (item.artwork || !item.url) {
        return null; // 已有封面 / 无路径，无需补
    }
    // 复用 infra 封面解析（约定路径 + exists 自愈 + 在途去重）；localPlugin 无 hasCoverArt 信息、缺省总试
    const artwork = await resolveCover(item.id, item.url);
    return artwork ? { artwork } : null;
}

/** 方法归口：共用 buildMethods 委托 definition（load 恒 ready，无需等待） */
const localMethods: PluginMethods = buildMethods({
    platform: localPluginPlatform,
    getDefinition: () => localDefinition,
    ensureLoaded: () => Promise.resolve(),
});

/** 内建本地插件单例：恒 ready，不参与注册表 / 启停 / 排序 */
export const localPlugin: Plugin = {
    platform: localPluginPlatform,
    hash: localPluginHash,
    supportedMethods: new Set<keyof PluginMethods>([
        'getMediaSource',
        'getMusicInfo',
        'getLyric',
    ]),
    state: 'ready',
    definition: localDefinition,
    methods: localMethods,
    load: () => Promise.resolve(),
};
