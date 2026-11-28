import {
    serializeKnownFingerprints,
    toFileMeta,
    toMusicItem,
} from './localFileTransform';

import type { ScannedAudioFile } from '@/native/mediaScanner';

function scannedFile(
    durationMs: number,
    declaredDuration: number,
): ScannedAudioFile {
    return {
        id: 'local-id',
        path: '/music/song.mp3',
        title: '文件标题',
        artist: '文件歌手',
        album: '文件专辑',
        albumArtist: '文件歌手',
        durationMs,
        sizeBytes: 1,
        mtimeMs: 1,
        folderPath: '/music',
        extension: 'mp3',
        hasCoverArt: false,
        mfMusicItem: JSON.stringify({
            v: 1,
            item: {
                platform: 'demo',
                id: 'song-id',
                title: '声明标题',
                artist: '声明歌手',
                album: '声明专辑',
                artwork: 'https://example.invalid/cover.jpg',
                duration: declaredDuration,
                url: 'https://example.invalid/audio.mp3',
            },
        }),
    };
}

describe('toMusicItem', () => {
    it('文件带来源声明时仍优先使用 TagLib 实测时长', () => {
        const item = toMusicItem(scannedFile(120_000, 999));

        expect(item).toMatchObject({
            platform: 'demo',
            id: 'song-id',
            title: '声明标题',
            artist: '声明歌手',
            album: '声明专辑',
            artwork: 'https://example.invalid/cover.jpg',
            duration: 120,
            url: 'file:///music/song.mp3',
        });
    });

    it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
        'TagLib 实测时长 %p 无效时沿用来源声明值',
        durationMs => {
            const item = toMusicItem(scannedFile(durationMs, 999));

            expect(item.duration).toBe(999);
        },
    );

    it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
        '实测时长 %p 无效且无来源声明时归一为 0',
        durationMs => {
            const file = { ...scannedFile(durationMs, 999), mfMusicItem: '' };

            expect(toMusicItem(file).duration).toBe(0);
        },
    );

    it('实测时长无效且来源声明损坏时归一为 0', () => {
        const file = {
            ...scannedFile(Number.NaN, 999),
            mfMusicItem: '{bad',
        };

        expect(toMusicItem(file).duration).toBe(0);
    });

    it('来源声明合法但声明时长无效时归一为 0，仍保留身份与展示字段', () => {
        const item = toMusicItem(scannedFile(0, -1));

        expect(item).toMatchObject({
            platform: 'demo',
            id: 'song-id',
            title: '声明标题',
            artist: '声明歌手',
            album: '声明专辑',
            artwork: 'https://example.invalid/cover.jpg',
            duration: 0,
            url: 'file:///music/song.mp3',
        });
    });
});

describe('旧标签码表逐文件打戳与失效', () => {
    const metaOf = (tagCharset?: string) => ({
        mtimeMs: 1,
        sizeBytes: 2,
        addedAt: 0,
        hasCoverArt: false,
        albumArtist: '',
        folderPath: '/',
        ...(tagCharset === undefined ? {} : { tagCharset }),
    });

    /*
     * 打戳这一支此前零覆盖：它是「这条按哪张码表读的」的唯一写入点，
     * 漏了它，下面的失效判据永远拿不到可比的值
     */
    it('读到的文件被戳上本次扫描的码表', () => {
        const meta = toFileMeta(scannedFile(1000, 0), undefined, 123, 'GBK');
        expect(meta.tagCharset).toBe('GBK');
    });

    it('不修复（空串码表）时也照样打戳——否则每次扫描都会重读', () => {
        const meta = toFileMeta(scannedFile(1000, 0), undefined, 123, '');
        expect(meta.tagCharset).toBe('');
    });

    it('码表一致的条目保留指纹', () => {
        const json = serializeKnownFingerprints(
            { '/a.mp3': metaOf('GBK') },
            'GBK',
        );
        expect(JSON.parse(json)).toEqual({ '/a.mp3': '1:2' });
    });

    it('码表不同的条目值清空、key 保留（key 参与原生删除结算）', () => {
        const json = serializeKnownFingerprints(
            { '/a.mp3': metaOf('BIG5') },
            'GBK',
        );
        expect(JSON.parse(json)).toEqual({ '/a.mp3': '' });
    });

    it('没戳过的条目（升级前入的库）同样失效', () => {
        const json = serializeKnownFingerprints(
            { '/a.mp3': metaOf(undefined) },
            'GBK',
        );
        expect(JSON.parse(json)).toEqual({ '/a.mp3': '' });
    });

    /*
     * 这条是逐文件粒度存在的理由：同一轮里读失败 / 未挂载的条目不会被重读，
     * 若按整库一刀切就会把它们也标成「已按新码表读过」而永久跳过
     */
    it('同一次里可以一部分保留、一部分失效', () => {
        const json = serializeKnownFingerprints(
            {
                '/done.mp3': metaOf('GBK'),
                '/failed.mp3': metaOf(undefined),
            },
            'GBK',
        );
        expect(JSON.parse(json)).toEqual({
            '/done.mp3': '1:2',
            '/failed.mp3': '',
        });
    });
});
