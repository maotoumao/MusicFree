/**
 * 信封的分块序列化：把 JSON 文本逐片交给 sink，任一时刻只持有一片
 * 目的是避免在信封之外再持有一份完整 JSON 字符串（信封对象本身仍整份在内存，受端口快照契约限制）
 * 只有骨架（花括号 / 方括号 / 逗号 / 键名）是手写的，所有值仍走 JSON.stringify 以保证转义正确
 * 分块粒度到单曲，故临时峰值由「最大单曲」决定；plugins / settings 条目少且短，整体写出
 * 媒体 DTO 逐条按协议清洗后再写出，插件挂上的不可 JSON 化字段不会污染或中断整次导出
 */
import type { BackupEnvelope } from './types';

/** 分块落点：实现方把每片追加到底层介质（文件 / 内存 / 网络） */
export interface BackupChunkSink {
    write(chunk: string): Promise<void>;
}

/** 写一个 JSON 数组，逐元素交给 writeItem（元素间的逗号由此处负责） */
async function writeArray<T>(
    sink: BackupChunkSink,
    items: readonly T[],
    writeItem: (item: T) => Promise<void>,
): Promise<void> {
    await sink.write('[');
    for (let i = 0; i < items.length; i += 1) {
        if (i > 0) {
            await sink.write(',');
        }
        await writeItem(items[i] as T);
    }
    await sink.write(']');
}

/**
 * 命中 toJSON 时改用其返回值（保 Date 等既有语义）
 * 与 JSON.stringify 一致：在属性站点施加、每层只调用一次、把键名传给它
 */
function applyToJson(value: unknown, key: string): unknown {
    if (value === null || typeof value !== 'object') {
        return value;
    }
    const { toJSON } = value as { toJSON?: unknown };
    return typeof toJSON === 'function'
        ? (toJSON as (jsonKey: string) => unknown).call(value, key)
        : value;
}

/**
 * 递归清洗一个值，返回 undefined 表示该字段应被丢弃
 * path 记录当前递归路径上的对象用于识别循环引用；出栈即移除，故共享引用（菱形）不会被误判
 */
function canonicalizeValue(value: unknown, path: Set<object>): unknown {
    if (value === null) {
        return null;
    }
    switch (typeof value) {
        case 'string':
        case 'boolean':
            return value;
        case 'number':
            // NaN / Infinity：stringify 会写成 null，协议要求整个字段丢弃
            return Number.isFinite(value) ? value : undefined;
        case 'object':
            break;
        default:
            // undefined / function / symbol / bigint
            return undefined;
    }

    const object = value as object;
    if (path.has(object)) {
        return undefined;
    }
    path.add(object);
    try {
        if (Array.isArray(object)) {
            const result: unknown[] = [];
            for (let index = 0; index < object.length; index += 1) {
                const clean = canonicalizeValue(
                    applyToJson(object[index], String(index)),
                    path,
                );
                // 数组槽位不能删（会改变长度与下标），空位补 null
                result.push(clean === undefined ? null : clean);
            }
            return result;
        }
        return canonicalizeEntries(object, path, false);
    } finally {
        path.delete(object);
    }
}

/** 收集对象的自有可枚举字符串键；Symbol 键不在 Object.keys 内，天然被丢弃 */
function canonicalizeEntries(
    object: object,
    path: Set<object>,
    isDtoRoot: boolean,
): Record<string, unknown> {
    // 以无原型对象承接，使 __proto__ 这类合法扩展键落为自有数据属性而非触发原型 setter
    const result = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(object)) {
        // legacy 遗留的内部运行时字段只在 DTO 顶层剥离，插件合法扩展字段不受影响
        // 先判断再取值，避免读取本应剥离字段的 getter
        if (isDtoRoot && key.startsWith('$')) {
            continue;
        }
        const raw = (object as Record<string, unknown>)[key];
        const clean = canonicalizeValue(applyToJson(raw, key), path);
        if (clean !== undefined) {
            result[key] = clean;
        }
    }
    return result;
}

/**
 * 按协议清洗媒体 DTO：剥离顶层 $ 前缀键与 Symbol 键，不可 JSON 化的值按字段丢弃而非使整项失败
 * 结果保证能安全 stringify（不会抛错、不会产出 undefined）
 * 根层不施加 toJSON：DTO 按契约是纯数据对象，若允许其变成非对象会让所有调用点被迫处理该形态
 */
function canonicalizeMediaDto(dto: object): Record<string, unknown> {
    // 根对象需先入路径，否则指回根的字段会被多展开一层才识别出循环
    return canonicalizeEntries(dto, new Set([dto]), true);
}

function toWireMusicItem(dto: object): Record<string, unknown> {
    const item = canonicalizeMediaDto(dto);
    for (const field of ['title', 'artist', 'album', 'artwork']) {
        if (typeof item[field] !== 'string') {
            item[field] = '';
        }
    }
    if (typeof item.duration !== 'number' || !Number.isFinite(item.duration)) {
        item.duration = 0;
    }
    return item;
}

/** 逐条写出媒体 DTO 数组，每条先清洗再 stringify */
function writeMediaDtoItems(
    sink: BackupChunkSink,
    items: readonly object[],
): Promise<void> {
    return writeArray(sink, items, item =>
        sink.write(JSON.stringify(toWireMusicItem(item))),
    );
}

/**
 * 写一个「若干标量字段 + 末尾一个大数组」的对象
 * 歌单与收藏都是这种形状：头部字段很小，musicList 可能有数万条，必须逐条写
 * head 里编码结果为 undefined 的键跳过（与 JSON.stringify 的省略行为一致）
 */
async function writeObjectWithArrayTail(
    sink: BackupChunkSink,
    head: object,
    arrayKey: string,
    items: readonly object[] | undefined,
): Promise<void> {
    await sink.write('{');
    let needComma = false;
    for (const [key, value] of Object.entries(head)) {
        // stringify 对 undefined / 函数 / Symbol 返回 undefined，此时整个键必须省略
        // starred 的头部即插件 DTO 顶层，可能带函数字段；插值写出会产出非法 JSON
        const encoded = JSON.stringify(value);
        if (encoded === undefined) {
            continue;
        }
        await sink.write(
            `${needComma ? ',' : ''}${JSON.stringify(key)}:${encoded}`,
        );
        needComma = true;
    }
    if (items !== undefined) {
        await sink.write(`${needComma ? ',' : ''}${JSON.stringify(arrayKey)}:`);
        await writeMediaDtoItems(sink, items);
    }
    await sink.write('}');
}

/** 段内元素类型由 sections 推导，避免在此二次声明而漂移 */
type LocalPlaylistTransfer = NonNullable<
    BackupEnvelope['sections']['musicSheets']
>[number];
type StarredPlaylistTransfer = NonNullable<
    BackupEnvelope['sections']['starredPlaylists']
>[number];
type MediaMetaTransfer = NonNullable<
    BackupEnvelope['sections']['mediaMeta']
>[number];

/**
 * 收藏歌单头的 wire 形态：清洗后再消解 coverImg
 * coverImg 是 artwork 的 legacy 别名，写出以 artwork 为准且固定不写 coverImg，避免非确定性输出
 * 只在收藏项做，MusicItem 上的 coverImg 可能是合法插件扩展字段
 */
function toWireStarredHead(head: object): Record<string, unknown> {
    const { coverImg, ...rest } = canonicalizeMediaDto(head);
    if (rest.artwork === undefined && typeof coverImg === 'string') {
        rest.artwork = coverImg;
    }
    return rest;
}

/**
 * mediaMeta 条目本身是 App 自有结构，只有内嵌的 associatedLyric.musicItem 是媒体 DTO
 * 故清洗只施加在内层，否则外层会被误剥 $ 键、而真正的 DTO 顶层反倒剥不到
 */
function toWireMediaMeta(item: MediaMetaTransfer): Record<string, unknown> {
    const { associatedLyric, ...rest } = item;
    if (associatedLyric === undefined) {
        return { ...rest };
    }
    return {
        ...rest,
        associatedLyric: {
            musicItem: toWireMusicItem(associatedLyric.musicItem),
        },
    };
}

/** 本地歌单：头部字段 + 逐曲写出的 musicList */
function writeLocalPlaylist(
    sink: BackupChunkSink,
    playlist: LocalPlaylistTransfer,
): Promise<void> {
    const { musicList, ...head } = playlist;
    return writeObjectWithArrayTail(sink, head, 'musicList', musicList);
}

/** 收藏歌单：头部字段 + 可选的内嵌 musicList（缺省则整个键不写出） */
function writeStarredPlaylist(
    sink: BackupChunkSink,
    playlist: StarredPlaylistTransfer,
): Promise<void> {
    const { musicList, ...head } = playlist;
    // 收藏项本身就是插件 DTO，其头部即 DTO 顶层，需按协议清洗
    return writeObjectWithArrayTail(
        sink,
        toWireStarredHead(head),
        'musicList',
        musicList,
    );
}

/**
 * 分块写出整个信封
 * 段的出现与否忠实反映 sections：缺段不写出该键（缺段 = 未导出，恢复端据此 no-op）
 */
export async function serializeEnvelope(
    envelope: BackupEnvelope,
    sink: BackupChunkSink,
): Promise<void> {
    await sink.write(
        `{"format":${JSON.stringify(envelope.format)},"version":${
            envelope.version
        },` +
            `"createdAt":${envelope.createdAt},"origin":${JSON.stringify(
                envelope.origin,
            )},"sections":{`,
    );

    const { sections } = envelope;
    let needComma = false;
    /** 段之间的逗号；返回该段的键名前缀 */
    const sectionPrefix = (name: string): string => {
        const prefix = `${needComma ? ',' : ''}${JSON.stringify(name)}:`;
        needComma = true;
        return prefix;
    };

    if (sections.musicSheets !== undefined) {
        await sink.write(sectionPrefix('musicSheets'));
        await writeArray(sink, sections.musicSheets, playlist =>
            writeLocalPlaylist(sink, playlist),
        );
    }
    if (sections.starredPlaylists !== undefined) {
        await sink.write(sectionPrefix('starredPlaylists'));
        await writeArray(sink, sections.starredPlaylists, playlist =>
            writeStarredPlaylist(sink, playlist),
        );
    }
    if (sections.plugins !== undefined) {
        // 插件段是数十条级别，整体 stringify 不构成内存压力
        await sink.write(
            `${sectionPrefix('plugins')}${JSON.stringify(sections.plugins)}`,
        );
    }
    if (sections.mediaMeta !== undefined) {
        await sink.write(sectionPrefix('mediaMeta'));
        await writeArray(sink, sections.mediaMeta, item =>
            sink.write(JSON.stringify(toWireMediaMeta(item))),
        );
    }
    if (sections.settings !== undefined) {
        await sink.write(
            `${sectionPrefix('settings')}${JSON.stringify(sections.settings)}`,
        );
    }

    await sink.write('}}');
}
