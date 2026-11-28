/**
 * 歌词文本的文件仓库（RNFS）
 *
 * 分两区：`custom/` 是用户手工编辑的词，不可再生故持久保留、不参与淘汰；
 * `cache/` 是插件默认词与关联来源的词，都能重新取回，故按近似 LRU 淘汰
 *
 * 文本不进 MMKV：侧表是「一个 key 一个 JSON blob」，把几 KB 歌词塞进去会让改任何字段
 * （扫描写 localPath、拖一下偏移滑杆）都把整份文本重新序列化 append 一遍
 *
 * 两区的写入策略按「毁了要不要紧」分开：cache/ 直接覆写，写坏了下次重取即可；
 * custom/ 不可再生，故写临时文件再 move，写入过程出错时旧的那份仍完好
 */
import {
    exists,
    mkdir,
    moveFile,
    readDir,
    readFile,
    stat,
    touch,
    unlink,
    writeFile,
} from '@dr.pogodin/react-native-fs';

import { lyricDir } from '@/infra/paths';
import { mediaHash } from '@/utils/media';

import type { LyricText } from './types';
import type { MediaRef } from '@/types';

/** 用户手工编辑的词：持久，不淘汰 */
const CUSTOM_DIR = `${lyricDir}/custom`;
/** 插件词与关联来源的词：可重新取回，按近似 LRU 淘汰 */
const CACHE_DIR = `${lyricDir}/cache`;

/** 缓存条数上限；一条几 KB，5000 条约十几 MB 封顶 */
const CACHE_MAX_ENTRIES = 5000;
/** 超限时一次清到上限的这个比例，留出余量避免刚清完又超限 */
const CACHE_PRUNE_TARGET_RATIO = 0.8;
/**
 * 负缓存有效期：插件明确说「这首没词」时记一笔，省下每次播放的白请求
 * 不能长期有效——插件是不可信代码，可能把网络错误吞掉返回空，一天后重试兜住这种误判
 */
const NEGATIVE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * 缓存查询结果
 * hit=有词；none=插件明确说过没词且未过期；absent=没缓存过、已过期或内容损坏
 */
export type CacheLookup =
    | { kind: 'hit'; text: LyricText }
    | { kind: 'none' }
    | { kind: 'absent' };

/** 正文文件名：64 位十六进制摘要 + .json */
const TEXT_NAME = /^[0-9a-f]{64}\.json$/;
/** 负缓存标记名：同名摘要 + .none，内容为空、只用 mtime 记时间 */
const MARKER_NAME = /^[0-9a-f]{64}\.none$/;
/** 自定义歌词落盘时的中转名：写完再 move 到目的名 */
const TEMP_SUFFIX = '.writing';

// —— 自定义歌词 ——

/** 读某首歌的自定义歌词；没有或文件损坏返回 null */
export async function readCustomLyric(
    ref: MediaRef,
): Promise<LyricText | null> {
    const result = await readText(`${CUSTOM_DIR}/${mediaHash(ref)}.json`);
    return result.status === 'ok' ? result.text : null;
}

/** 写某首歌的自定义歌词（覆盖已有）；写失败抛出，由调用方决定是否提示 */
export async function writeCustomLyric(
    ref: MediaRef,
    text: LyricText,
): Promise<void> {
    const dest = `${CUSTOM_DIR}/${mediaHash(ref)}.json`;
    const temp = `${dest}${TEMP_SUFFIX}`;
    await ensureDir(CUSTOM_DIR);
    await writeFile(temp, JSON.stringify(text), 'utf8');
    try {
        // Android 的 moveFile 是 rename(2)，直接原子替换；iOS 的 moveItemAtPath
        // 遇目的已存在会失败，故退一步先删旧的再 move——那条路径剩下的窗口只有这一步
        await moveFile(temp, dest).catch(async () => {
            await removeQuietly(dest);
            await moveFile(temp, dest);
        });
    } catch (error) {
        await removeQuietly(temp);
        throw error;
    }
}

/** best-effort 删除某首歌的自定义歌词 */
export function deleteCustomLyric(ref: MediaRef): Promise<void> {
    return removeQuietly(`${CUSTOM_DIR}/${mediaHash(ref)}.json`);
}

// —— 缓存 ——

/**
 * 查某个身份的歌词缓存
 * 命中时 touch mtime，使 mtime 表示「最后使用时间」——淘汰按最旧优先才等于近似 LRU；
 * 用写入时间排序会把「常听但很久以前缓存的歌」当成最冷的先淘汰
 */
export async function readCachedLyric(ref: MediaRef): Promise<CacheLookup> {
    const hash = mediaHash(ref);
    const textPath = `${CACHE_DIR}/${hash}.json`;
    const result = await readText(textPath);
    if (result.status === 'ok') {
        await touch(textPath, new Date()).catch(() => undefined);
        return { kind: 'hit', text: result.text };
    }
    if (result.status === 'corrupt') {
        // 正文写坏了就地清掉，让下次取词重新拉；不去看负缓存标记——
        // 「这条正文坏了」和「插件说过没词」是两回事，混用会把损坏当成没词
        await removeQuietly(textPath);
        return { kind: 'absent' };
    }
    const markerPath = `${CACHE_DIR}/${hash}.none`;
    const markedAt = await mtimeOf(markerPath);
    if (markedAt === null) {
        return { kind: 'absent' };
    }
    if (Date.now() - markedAt >= NEGATIVE_TTL_MS) {
        // 过期即视作没缓存过，顺手清掉标记；清不掉也无妨，下次重新判过期
        await removeQuietly(markerPath);
        return { kind: 'absent' };
    }
    return { kind: 'none' };
}

/** 写入某个身份的歌词缓存；同时清掉负缓存标记，保持正负两态互斥 */
export async function writeCachedLyric(
    ref: MediaRef,
    text: LyricText,
): Promise<void> {
    const hash = mediaHash(ref);
    await writeText(CACHE_DIR, `${hash}.json`, text);
    await removeQuietly(`${CACHE_DIR}/${hash}.none`);
}

/**
 * 记一笔「这个身份没有歌词」；同时清掉可能存在的正文，保持正负两态互斥
 * 只在插件**成功返回但解析不出行**时调用——插件不存在、插件不支持取词、取词抛错
 * 都不该记：前两者装回或换插件就有了，后者是暂时故障，记下来等于把一次失败变成长期无词
 *
 * 整体 best-effort：记不上负缓存只是下次多请求一次，不值得打断取词
 */
export async function writeCachedMiss(ref: MediaRef): Promise<void> {
    const hash = mediaHash(ref);
    try {
        await ensureDir(CACHE_DIR);
        await writeFile(`${CACHE_DIR}/${hash}.none`, '', 'utf8');
    } catch {
        return;
    }
    await removeQuietly(`${CACHE_DIR}/${hash}.json`);
}

/**
 * 淘汰超出上限的缓存条目，按 mtime 最旧优先
 * 一次清到上限的 CACHE_PRUNE_TARGET_RATIO，留出余量避免刚清完又超限
 * 由 core/lyric 在启动时调一次即可：单次会话新增的条目远到不了上限
 */
export async function pruneLyricCache(): Promise<void> {
    let entries;
    try {
        entries = await readDir(CACHE_DIR);
    } catch {
        // 目录还不存在（首次运行）或读不了，没什么可淘汰的
        return;
    }
    // 必须先要求 isFile：RNFS 的 unlink 对目录是递归删除，名字碰巧匹配就会整棵删掉
    const managed = entries.filter(
        entry =>
            entry.isFile() &&
            (TEXT_NAME.test(entry.name) || MARKER_NAME.test(entry.name)),
    );
    if (managed.length <= CACHE_MAX_ENTRIES) {
        return;
    }
    // mtime 缺失的排最前优先淘汰：读不到时间的条目没有「热」的证据
    managed.sort(
        (a, b) => (a.mtime?.getTime() ?? 0) - (b.mtime?.getTime() ?? 0),
    );
    const keep = Math.floor(CACHE_MAX_ENTRIES * CACHE_PRUNE_TARGET_RATIO);
    for (const entry of managed.slice(0, managed.length - keep)) {
        // 条目刚从 readDir 拿到，直接删不必再 exists 一次（省掉一半过桥调用）
        await unlink(`${CACHE_DIR}/${entry.name}`).catch(() => undefined);
    }
}

// —— 内部 ——

/** 读取结果：missing=文件不存在；corrupt=读到了但内容不可用，两者的处置不同 */
type ReadResult =
    | { status: 'ok'; text: LyricText }
    | { status: 'missing' }
    | { status: 'corrupt' };

/**
 * 读一份歌词文本
 * 持久化数据是系统边界：内容不可用只当损坏，不能把异常抛给取词链
 * I/O 错误当前也归入 missing——调用方尚无区分它的处置，等真有需要再细分
 */
async function readText(path: string): Promise<ReadResult> {
    let raw: string;
    try {
        if (!(await exists(path))) {
            return { status: 'missing' };
        }
        raw = await readFile(path, 'utf8');
    } catch {
        return { status: 'missing' };
    }
    try {
        const parsed: unknown = JSON.parse(raw);
        if (
            typeof parsed !== 'object' ||
            parsed === null ||
            typeof (parsed as LyricText).rawLrc !== 'string'
        ) {
            return { status: 'corrupt' };
        }
        const { rawLrc, translation } = parsed as LyricText;
        return {
            status: 'ok',
            text:
                typeof translation === 'string'
                    ? { rawLrc, translation }
                    : { rawLrc },
        };
    } catch {
        return { status: 'corrupt' };
    }
}

/** 覆盖写目的文件；两端的 writeFile 都是覆盖语义，无需先删 */
async function writeText(
    dir: string,
    name: string,
    text: LyricText,
): Promise<void> {
    await ensureDir(dir);
    await writeFile(`${dir}/${name}`, JSON.stringify(text), 'utf8');
}

/**
 * 确保目录存在，并（在 iOS 上）断言备份策略
 *
 * 无条件调 mkdir 而不是先 exists：排除备份的属性只能随 mkdir 设置，
 * 加了守卫它就只在首次创建时生效，目录已存在的装机永远补不上、且无路径可修复。
 * 两端的 mkdir 对已存在目录都成功（iOS `withIntermediateDirectories:YES`、
 * Android 建完只校验 exists），故去掉守卫不改变成功语义，调用次数也持平
 *
 * cache/ 里的词都能重新取回，不该占用户的 iCloud 空间；
 * custom/ 不可再生，故意留在备份内——它不进 App 自己的备份文件，正好由系统备份兜住
 */
async function ensureDir(dir: string): Promise<void> {
    await mkdir(dir, { NSURLIsExcludedFromBackupKey: dir === CACHE_DIR });
}

/** best-effort 删除单个文件；不存在或删不掉都不抛 */
async function removeQuietly(path: string): Promise<void> {
    try {
        if (await exists(path)) {
            await unlink(path);
        }
    } catch {
        // 清理失败不影响已提交的业务
    }
}

/** 文件的 mtime 毫秒值；不存在或读不到返回 null */
async function mtimeOf(path: string): Promise<number | null> {
    try {
        if (!(await exists(path))) {
            return null;
        }
        return (await stat(path)).mtime.getTime();
    } catch {
        return null;
    }
}
