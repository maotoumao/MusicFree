import { serializeEnvelope, type BackupChunkSink } from './serialize';

import type { BackupEnvelope } from './types';

const musicDefaults = {
    title: '',
    artist: '',
    album: '',
    artwork: '',
    duration: 0,
};

/** 记录每一片，便于断言「确实分块」而非一次写完 */
function memorySink(): BackupChunkSink & { chunks: string[]; text(): string } {
    const chunks: string[] = [];
    return {
        chunks,
        text: () => chunks.join(''),
        write(chunk) {
            chunks.push(chunk);
            return Promise.resolve();
        },
    };
}

function envelope(sections: unknown): BackupEnvelope {
    return {
        format: 'musicfree-backup',
        version: 2,
        createdAt: 1700000000000,
        origin: {
            platform: 'android',
            appVersion: '1.2.3',
            installationId: 'install-xyz',
        },
        sections,
    } as BackupEnvelope;
}

/** 流式产出的文本必须与直接 JSON.stringify 同一信封完全等价 */
function expectRoundTrip(value: BackupEnvelope, text: string): void {
    expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(value)));
}

describe('信封分块序列化', () => {
    it('与 JSON.stringify 等价：全段齐全', async () => {
        const value = envelope({
            musicSheets: [
                {
                    id: 'favorite',
                    title: '我喜欢',
                    createdAt: 111,
                    sortMode: 'addedAtDesc',
                    musicList: [
                        {
                            ...musicDefaults,
                            platform: 'p',
                            id: 'a',
                            title: '甲',
                        },
                        {
                            ...musicDefaults,
                            platform: 'p',
                            id: 'b',
                            title: '乙',
                        },
                    ],
                },
                { id: 'u1', title: '歌单一', musicList: [] },
            ],
            starredPlaylists: [
                { platform: 'p', id: 's1', title: '收藏一' },
                {
                    platform: 'p',
                    id: 's2',
                    musicList: [{ ...musicDefaults, platform: 'p', id: 'c' }],
                },
            ],
            plugins: {
                installed: [{ srcUrl: 'https://ex/a.js', enabled: true }],
                subscriptions: [],
                alternatives: [],
            },
            mediaMeta: [{ platform: 'p', id: 'm', lyricOffset: -500 }],
            settings: { values: { 'lyric.fontSize': 'large' } },
        });
        const sink = memorySink();

        await serializeEnvelope(value, sink);

        expectRoundTrip(value, sink.text());
    });

    it('缺段不写出该键（缺段 = 未导出，与空段语义不同）', async () => {
        const value = envelope({ starredPlaylists: [] });
        const sink = memorySink();

        await serializeEnvelope(value, sink);

        const parsed = JSON.parse(sink.text()) as BackupEnvelope;
        expect(Object.keys(parsed.sections)).toEqual(['starredPlaylists']);
        expect(parsed.sections.starredPlaylists).toEqual([]);
        expectRoundTrip(value, sink.text());
    });

    it('全部段缺失 → sections 为空对象', async () => {
        const value = envelope({});
        const sink = memorySink();

        await serializeEnvelope(value, sink);

        expect(JSON.parse(sink.text()).sections).toEqual({});
        expectRoundTrip(value, sink.text());
    });

    it('收藏歌单缺 musicList 时不写出该键', async () => {
        const value = envelope({
            starredPlaylists: [{ platform: 'p', id: 's1' }],
        });
        const sink = memorySink();

        await serializeEnvelope(value, sink);

        const parsed = JSON.parse(sink.text()) as {
            sections: { starredPlaylists: Record<string, unknown>[] };
        };
        expect(parsed.sections.starredPlaylists[0]).not.toHaveProperty(
            'musicList',
        );
    });

    it('特殊字符与 Unicode 由 JSON.stringify 负责转义', async () => {
        const value = envelope({
            musicSheets: [
                {
                    id: 'favorite',
                    title: '引号"反斜杠\\换行\n制表\t',
                    musicList: [
                        {
                            ...musicDefaults,
                            platform: 'p',
                            id: 'a',
                            title: '🎵 emoji 与「书名」',
                        },
                    ],
                },
            ],
        });
        const sink = memorySink();

        await serializeEnvelope(value, sink);

        expectRoundTrip(value, sink.text());
    });

    it('头部字段编码为 undefined 时整个键省略，不产出非法 JSON', async () => {
        const sink = memorySink();

        await serializeEnvelope(
            envelope({
                // 收藏项的头部就是插件 DTO 顶层，插件可能挂上不可 JSON 化的字段
                starredPlaylists: [
                    {
                        platform: 'p',
                        id: 's1',
                        resolve: () => 'fn',
                        tag: Symbol('x'),
                        missing: undefined,
                        kept: null,
                    },
                ],
            }),
            sink,
        );

        const parsed = JSON.parse(sink.text()) as {
            sections: { starredPlaylists: Record<string, unknown>[] };
        };
        const item = parsed.sections.starredPlaylists[0]!;
        expect(item).toEqual({ platform: 'p', id: 's1', kept: null });
    });

    it('头部字段全部不可编码、仅剩尾数组时仍合法', async () => {
        const sink = memorySink();

        await serializeEnvelope(
            envelope({
                starredPlaylists: [
                    { drop: undefined, fn: () => 1, musicList: [] },
                ],
            }),
            sink,
        );

        expect(
            (
                JSON.parse(sink.text()) as {
                    sections: { starredPlaylists: Record<string, unknown>[] };
                }
            ).sections.starredPlaylists[0],
        ).toEqual({ musicList: [] });
    });

    it('确实逐曲分块：没有任何一片同时包含两首曲目', async () => {
        const many = Array.from({ length: 50 }, (_, i) => ({
            platform: 'p',
            id: `m${i}`,
        }));
        const sink = memorySink();

        await serializeEnvelope(
            envelope({
                musicSheets: [{ id: 'favorite', title: 'F', musicList: many }],
            }),
            sink,
        );

        for (const chunk of sink.chunks) {
            const hits = many.filter(item =>
                chunk.includes(`"${item.id}"`),
            ).length;
            expect(hits).toBeLessThanOrEqual(1);
        }
        // 每首曲目都确实写出了
        expect(sink.text()).toContain('"m49"');
    });
});

describe('媒体 DTO 按协议清洗', () => {
    /** 取出唯一一首曲目的解析结果 */
    async function writeOneSong(
        song: unknown,
    ): Promise<Record<string, unknown>> {
        const sink = memorySink();
        await serializeEnvelope(
            envelope({
                musicSheets: [
                    { id: 'favorite', title: 'F', musicList: [song] },
                ],
            }),
            sink,
        );
        const parsed = JSON.parse(sink.text()) as {
            sections: {
                musicSheets: { musicList: Record<string, unknown>[] }[];
            };
        };
        return parsed.sections.musicSheets[0]!.musicList[0]!;
    }

    it('剥离顶层 $ 前缀键，嵌套层的 $ 键保留', async () => {
        const song = await writeOneSong({
            platform: 'p',
            id: 'a',
            $legacyInternal: 'drop',
            extra: { $keep: 'nested' },
        });

        expect(song).not.toHaveProperty('$legacyInternal');
        expect(song.extra).toEqual({ $keep: 'nested' });
    });

    it('缺失或非法歌曲字段补默认值，不修改源记录或插件扩展字段', async () => {
        const original = {
            platform: 'demo',
            id: 'minimal',
            title: null,
            artist: 3,
            album: false,
            artwork: {},
            duration: Infinity,
            extra: { keep: true },
        };
        const written = await writeOneSong(original);
        expect(written).toEqual({
            ...musicDefaults,
            platform: 'demo',
            id: 'minimal',
            extra: { keep: true },
        });
        expect(original.title).toBeNull();
        expect(original.duration).toBe(Infinity);
    });

    it('Symbol 键被丢弃', async () => {
        const song = await writeOneSong({
            platform: 'p',
            id: 'a',
            [Symbol('internal')]: 'drop',
        });

        expect(song).toEqual({ ...musicDefaults, platform: 'p', id: 'a' });
    });

    it('不可 JSON 化的值按字段丢弃，不使整项失败', async () => {
        const song = await writeOneSong({
            platform: 'p',
            id: 'a',
            duration: NaN,
            bitrate: Infinity,
            size: BigInt(9),
            resolve: () => 'fn',
            tag: Symbol('x'),
            missing: undefined,
            title: '保留',
        });

        expect(song).toEqual({
            ...musicDefaults,
            platform: 'p',
            id: 'a',
            title: '保留',
        });
    });

    it('循环引用被丢弃而非抛错', async () => {
        const song: Record<string, unknown> = { platform: 'p', id: 'a' };
        song.self = song;
        song.nested = { back: song, keep: 1 };

        await expect(writeOneSong(song)).resolves.toEqual({
            ...musicDefaults,
            platform: 'p',
            id: 'a',
            nested: { keep: 1 },
        });
    });

    it('共享引用（非循环）不被误判为循环', async () => {
        const shared = { tag: 'same' };
        const song = await writeOneSong({
            platform: 'p',
            id: 'a',
            first: shared,
            second: shared,
        });

        expect(song.first).toEqual({ tag: 'same' });
        expect(song.second).toEqual({ tag: 'same' });
    });

    it('数组内不可编码的槽位补 null，不改变长度', async () => {
        const song = await writeOneSong({
            platform: 'p',
            id: 'a',
            marks: [1, NaN, 'x', () => 1],
        });

        expect(song.marks).toEqual([1, null, 'x', null]);
    });

    it('保留自带 toJSON 的值的既有语义', async () => {
        const song = await writeOneSong({
            platform: 'p',
            id: 'a',
            addedAt: new Date('2024-01-02T03:04:05.000Z'),
        });

        expect(song.addedAt).toBe('2024-01-02T03:04:05.000Z');
    });

    it('收藏项顶层同样被清洗', async () => {
        const sink = memorySink();

        await serializeEnvelope(
            envelope({
                starredPlaylists: [
                    { platform: 'p', id: 's1', $internal: 'drop', worth: NaN },
                ],
            }),
            sink,
        );

        expect(
            (
                JSON.parse(sink.text()) as {
                    sections: { starredPlaylists: Record<string, unknown>[] };
                }
            ).sections.starredPlaylists[0],
        ).toEqual({ platform: 'p', id: 's1' });
    });

    it('被剥离的 $ 键不会触发其 getter', async () => {
        const touched = jest.fn();
        const song: Record<string, unknown> = { platform: 'p', id: 'a' };
        Object.defineProperty(song, '$internal', {
            enumerable: true,
            get: touched,
        });

        await writeOneSong(song);

        expect(touched).not.toHaveBeenCalled();
    });

    it('自有 __proto__ 键作为普通字段保留', async () => {
        // 插件数据常来自 JSON.parse，其产出的 __proto__ 是自有数据属性
        const song = await writeOneSong(
            JSON.parse('{"platform":"p","id":"a","__proto__":{"x":1}}'),
        );

        expect(song).toHaveProperty('__proto__');
        expect(JSON.stringify(song)).toContain('__proto__');
    });

    it('toJSON 收到所在键名，且其返回值不再被二次施加 toJSON', async () => {
        const seenKeys: string[] = [];
        const nested = {
            toJSON(key: string) {
                seenKeys.push(key);
                // 返回值自身仍带 toJSON：标准行为是不再调用，否则会无限递归
                return { toJSON: () => ({ deep: 'never' }), value: 'once' };
            },
        };

        const song = await writeOneSong({ platform: 'p', id: 'a', nested });

        expect(seenKeys).toEqual(['nested']);
        expect(song.nested).toEqual({ value: 'once' });
    });

    it('toJSON 返回自身时按普通对象展开，不误判为循环', async () => {
        const nested: Record<string, unknown> = { keep: 1 };
        nested.toJSON = () => nested;

        const song = await writeOneSong({ platform: 'p', id: 'a', nested });

        expect(song.nested).toEqual({ keep: 1 });
    });
});

describe('mediaMeta 只清洗内嵌的 musicItem', () => {
    it('外层结构原样保留，内层 musicItem 顶层 $ 键被剥离', async () => {
        const sink = memorySink();

        await serializeEnvelope(
            envelope({
                mediaMeta: [
                    {
                        platform: 'p',
                        id: 'm',
                        lyricOffset: -500,
                        associatedLyric: {
                            musicItem: {
                                platform: 'p',
                                id: 'x',
                                $internal: 'drop',
                                nested: { $keep: 1 },
                            },
                        },
                    },
                ],
            }),
            sink,
        );

        expect(
            (
                JSON.parse(sink.text()) as {
                    sections: { mediaMeta: Record<string, unknown>[] };
                }
            ).sections.mediaMeta[0],
        ).toEqual({
            platform: 'p',
            id: 'm',
            lyricOffset: -500,
            associatedLyric: {
                musicItem: {
                    ...musicDefaults,
                    platform: 'p',
                    id: 'x',
                    nested: { $keep: 1 },
                },
            },
        });
    });
});

describe('coverImg 是 artwork 的 legacy 别名', () => {
    async function writeStarred(
        item: unknown,
    ): Promise<Record<string, unknown>> {
        const sink = memorySink();
        await serializeEnvelope(envelope({ starredPlaylists: [item] }), sink);
        return (
            JSON.parse(sink.text()) as {
                sections: { starredPlaylists: Record<string, unknown>[] };
            }
        ).sections.starredPlaylists[0]!;
    }

    it('只有 coverImg 时归一为 artwork，且不写出 coverImg', async () => {
        await expect(
            writeStarred({ platform: 'p', id: 's1', coverImg: 'https://ex/c' }),
        ).resolves.toEqual({
            platform: 'p',
            id: 's1',
            artwork: 'https://ex/c',
        });
    });

    it('两者并存时以 artwork 为准，coverImg 固定不写出', async () => {
        await expect(
            writeStarred({
                platform: 'p',
                id: 's1',
                artwork: 'https://ex/a',
                coverImg: 'https://ex/c',
            }),
        ).resolves.toEqual({
            platform: 'p',
            id: 's1',
            artwork: 'https://ex/a',
        });
    });

    it('MusicItem 上的 coverImg 视为插件扩展字段而保留', async () => {
        const sink = memorySink();

        await serializeEnvelope(
            envelope({
                musicSheets: [
                    {
                        id: 'favorite',
                        title: 'F',
                        musicList: [
                            {
                                platform: 'p',
                                id: 'a',
                                coverImg: 'https://ex/c',
                            },
                        ],
                    },
                ],
            }),
            sink,
        );

        expect(sink.text()).toContain('coverImg');
    });
});
