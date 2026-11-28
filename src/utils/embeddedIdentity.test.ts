import {
    MAX_EMBEDDED_IDENTITY_CHARS,
    encodeEmbeddedIdentity,
    parseEmbeddedIdentity,
} from './embeddedIdentity';

import type { MusicItem } from '@/types';

/** 带插件私有字段的歌：`hash` / `songmid` 这类是插件日后重新检索音源的依据 */
const item = {
    platform: '示例音源',
    id: 'song-1',
    title: '夜间列车',
    artist: '甲',
    album: '乙',
    artwork: 'https://example.com/a.jpg',
    duration: 251,
    url: 'https://cdn.example.com/a.mp3',
    hash: 'ABC123',
    songmid: 'mid-9',
} as unknown as MusicItem;

const decode = (text: string | undefined) =>
    JSON.parse(text ?? '') as { v: number; item: Record<string, unknown> };

describe('encodeEmbeddedIdentity', () => {
    // 裁掉插件私有字段等于让文件永久失去可解析性——插件靠它们重新检索音源
    it.each(['hash', 'songmid', 'url'])('保留字段 %s', field => {
        expect(decode(encodeEmbeddedIdentity(item)).item).toHaveProperty(field);
    });

    it.each(['lyric', 'lrc', 'rawLrc'])('剔除歌词字段 %s', field => {
        const text = encodeEmbeddedIdentity({
            ...item,
            [field]: 'MUST_NOT_APPEAR',
        });
        expect(text).not.toContain('MUST_NOT_APPEAR');
    });

    it('剔除顶层 $ 内部键，嵌套层的 $ 保留', () => {
        const text = encodeEmbeddedIdentity({
            ...item,
            $sortIndex: 3,
            extra: { $keep: 1 },
        } as unknown as MusicItem);
        expect(text).not.toContain('$sortIndex');
        expect(text).toContain('$keep');
    });

    // 身份远比一份注定过期的 URL 重要，不能因为音源太大就让文件退化成普通本地音乐
    it('超预算时牺牲音源缓存保住身份', () => {
        const bulky = {
            ...item,
            source: { standard: { url: 'x'.repeat(9000) } },
        } as unknown as MusicItem;

        const declared = decode(encodeEmbeddedIdentity(bulky)).item;

        expect(declared.id).toBe('song-1');
        expect(declared.hash).toBe('ABC123');
        expect(declared).not.toHaveProperty('source');
    });

    it('牺牲音源后仍超预算则不写 tag', () => {
        const huge = {
            ...item,
            hash: 'x'.repeat(MAX_EMBEDDED_IDENTITY_CHARS),
        } as unknown as MusicItem;
        expect(encodeEmbeddedIdentity(huge)).toBeUndefined();
    });

    it('产出可被解析回同一身份', () => {
        const parsed = parseEmbeddedIdentity(
            encodeEmbeddedIdentity(item) ?? '',
        );
        expect(parsed?.platform).toBe('示例音源');
        expect(parsed?.id).toBe('song-1');
        expect(parsed).toHaveProperty('hash', 'ABC123');
    });
});

describe('parseEmbeddedIdentity', () => {
    const declaration = { v: 1, item };

    it('解析合法 v1 声明并保留插件私有字段', () => {
        const parsed = parseEmbeddedIdentity(JSON.stringify(declaration));
        expect(parsed?.id).toBe('song-1');
        expect(parsed).toHaveProperty('songmid', 'mid-9');
    });

    // 只在写侧过滤挡不住被篡改的文件，读侧必须再剔一遍
    it.each(['lyric', 'rawLrc', '$sortIndex'])('丢弃被注入的 %s', field => {
        const raw = JSON.stringify({
            v: 1,
            item: { ...item, [field]: 'INJECTED' },
        });
        expect(parseEmbeddedIdentity(raw)).not.toHaveProperty(field);
    });

    it('展示字段类型被篡改时归为安全默认值，不把对象放进文本字段', () => {
        const raw = JSON.stringify({
            v: 1,
            item: {
                platform: 'p',
                id: 'i',
                title: { evil: 1 },
                duration: -5,
                url: { evil: 2 },
            },
        });
        const parsed = parseEmbeddedIdentity(raw);
        expect(parsed?.title).toBe('');
        expect(parsed?.duration).toBe(0);
        expect(parsed).not.toHaveProperty('url');
    });

    // 版本不认识必须整份拒绝：尽力解析会让旧代码把新含义的数据当旧数据用
    it.each([
        ['空串', ''],
        ['非 JSON', '{not json'],
        ['非对象', '"text"'],
        ['未知版本', JSON.stringify({ ...declaration, v: 2 })],
        ['缺版本', JSON.stringify({ item })],
        ['缺 item', JSON.stringify({ v: 1 })],
        ['item 无 platform', JSON.stringify({ v: 1, item: { id: 'x' } })],
        ['item 无 id', JSON.stringify({ v: 1, item: { platform: 'p' } })],
        [
            '超预算（被篡改的超大 tag）',
            JSON.stringify({
                ...declaration,
                pad: 'x'.repeat(MAX_EMBEDDED_IDENTITY_CHARS),
            }),
        ],
    ])('拒绝%s', (_label, raw) => {
        expect(parseEmbeddedIdentity(raw)).toBeUndefined();
    });
});
