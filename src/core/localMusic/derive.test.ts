import {
    deriveCollections,
    duplicatedRefs,
    pathByRef,
    sortedMusicList,
} from './derive';
import { DEFAULT_SORT, LOCAL_LIBRARY_SCHEMA_VERSION } from './types';

import type { LocalFileMeta, LocalLibrary } from './types';
import type { MusicItem } from '@/types';

const song = (id: string, extra?: Partial<MusicItem>): MusicItem => ({
    platform: '示例音源',
    id,
    title: `曲 ${id}`,
    artist: '甲',
    album: '乙',
    artwork: '',
    duration: 100,
    ...extra,
});

const meta = (folderPath: string, sizeBytes: number): LocalFileMeta => ({
    mtimeMs: 1,
    sizeBytes,
    addedAt: 1,
    hasCoverArt: false,
    albumArtist: '甲',
    folderPath,
});

/** 按 [path, item, sizeBytes] 造库；folderPath 取 path 的父目录 */
function libraryOf(
    entries: readonly [string, MusicItem, number][],
): LocalLibrary {
    const musicByPath: Record<string, MusicItem> = {};
    const files: Record<string, LocalFileMeta> = {};
    for (const [path, item, sizeBytes] of entries) {
        musicByPath[path] = item;
        files[path] = meta(path.slice(0, path.lastIndexOf('/')), sizeBytes);
    }
    return { version: LOCAL_LIBRARY_SCHEMA_VERSION, musicByPath, files };
}

describe('同一身份的多个文件副本只成一行', () => {
    it('代表取体积最大的那份（≈音质最高）', () => {
        const library = libraryOf([
            ['/a/s.mp3', song('1'), 3_000_000],
            ['/z/s.flac', song('1'), 30_000_000],
        ]);

        expect(pathByRef(library, song('1'))).toBe('/z/s.flac');
    });

    it('体积相同则取路径升序，保证确定性', () => {
        const library = libraryOf([
            ['/z/s.mp3', song('1'), 3_000_000],
            ['/a/s.mp3', song('1'), 3_000_000],
        ]);

        expect(pathByRef(library, song('1'))).toBe('/a/s.mp3');
    });

    // 代表若随遍历顺序漂移，列表行、反查与播放锚点会各指向一份不同的文件
    it('插入顺序不影响结果', () => {
        const forward = libraryOf([
            ['/a/s.mp3', song('1'), 3_000_000],
            ['/z/s.flac', song('1'), 30_000_000],
        ]);
        const reversed = libraryOf([
            ['/z/s.flac', song('1'), 30_000_000],
            ['/a/s.mp3', song('1'), 3_000_000],
        ]);

        expect(pathByRef(forward, song('1'))).toBe(
            pathByRef(reversed, song('1')),
        );
    });

    it('曲目列表里同一首歌只出现一次', () => {
        const library = libraryOf([
            ['/a/s.mp3', song('1'), 3_000_000],
            ['/z/s.flac', song('1'), 30_000_000],
            ['/a/t.mp3', song('2'), 3_000_000],
        ]);

        const list = sortedMusicList(library, DEFAULT_SORT);

        expect(list.map(x => x.id)).toEqual(['1', '2']);
    });

    // 去重发生在派生层而非写入层：库照实存两条，代表是现算的，
    // 故代表文件消失后副本能自动接替（写入层去重会让副本连 MusicItem 都没存下、永久消失）
    it('代表文件消失后由副本接替', () => {
        const library = libraryOf([
            ['/z/s.flac', song('1'), 30_000_000],
            ['/a/s.mp3', song('1'), 3_000_000],
        ]);
        expect(pathByRef(library, song('1'))).toBe('/z/s.flac');

        const afterDelete = libraryOf([['/a/s.mp3', song('1'), 3_000_000]]);

        expect(pathByRef(afterDelete, song('1'))).toBe('/a/s.mp3');
        expect(sortedMusicList(afterDelete, DEFAULT_SORT)).toHaveLength(1);
    });

    it('集合视图按代表路径归类，副本所在目录不重复计入', () => {
        const library = libraryOf([
            ['/a/s.mp3', song('1'), 3_000_000],
            ['/z/s.flac', song('1'), 30_000_000],
        ]);

        const folders = deriveCollections(library, 'folders');

        expect(folders).toHaveLength(1);
        expect(folders[0]).toMatchObject({ path: '/z', count: 1 });
    });
});

describe('duplicatedRefs', () => {
    it('无副本时为空——常见情况下调用方不必做任何纠正', () => {
        const library = libraryOf([
            ['/a/s.mp3', song('1'), 1],
            ['/a/t.mp3', song('2'), 1],
        ]);

        expect(duplicatedRefs(library).size).toBe(0);
    });

    it('只列出确有多份文件的身份，值为其代表路径', () => {
        const library = libraryOf([
            ['/a/s.mp3', song('1'), 3_000_000],
            ['/z/s.flac', song('1'), 30_000_000],
            ['/a/t.mp3', song('2'), 1],
        ]);

        const duplicated = duplicatedRefs(library);

        expect([...duplicated.values()]).toEqual(['/z/s.flac']);
    });
});

describe('曲目排序', () => {
    const library = libraryOf([
        ['/music/zero.mp3', song('zero', { duration: 0 }), 1],
        ['/music/nan.mp3', song('nan', { duration: Number.NaN }), 1],
        [
            '/music/infinity.mp3',
            song('infinity', { duration: Number.POSITIVE_INFINITY }),
            1,
        ],
        ['/music/negative.mp3', song('negative', { duration: -1 }), 1],
        ['/music/short-a.mp3', song('short-a', { duration: 60 }), 1],
        ['/music/long.mp3', song('long', { duration: 240 }), 1],
        ['/music/short-b.mp3', song('short-b', { duration: 60 }), 1],
    ]);

    it('从短到长，等长项保持原序、未知时长置末并保持原序', () => {
        expect(
            sortedMusicList(library, {
                by: 'duration',
                desc: false,
            }).map(item => item.id),
        ).toEqual([
            'short-a',
            'short-b',
            'long',
            'zero',
            'nan',
            'infinity',
            'negative',
        ]);
    });

    it('从长到短，等长项保持原序、未知时长仍置末并保持原序', () => {
        expect(
            sortedMusicList(library, {
                by: 'duration',
                desc: true,
            }).map(item => item.id),
        ).toEqual([
            'long',
            'short-a',
            'short-b',
            'zero',
            'nan',
            'infinity',
            'negative',
        ]);
    });

    it.each(['title', 'artist'] as const)(
        '%s 不是字符串时归一为空串，不让比较器做隐式转换',
        by => {
            const throwingValue = {
                toString: () => {
                    throw new Error('不应隐式转换');
                },
            } as unknown as string;
            const malformed = libraryOf([
                ['/music/text.mp3', song('text', { [by]: 'B' }), 1],
                [
                    '/music/malformed.mp3',
                    song('malformed', { [by]: throwingValue }),
                    1,
                ],
                ['/music/first.mp3', song('first', { [by]: 'A' }), 1],
            ]);

            expect(
                sortedMusicList(malformed, {
                    by,
                    desc: false,
                }).map(item => item.id),
            ).toEqual(['malformed', 'first', 'text']);
        },
    );

    it('addedAt 非有限值时作为未知值置末并保持原序', () => {
        const malformed = libraryOf([
            ['/music/nan.mp3', song('nan'), 1],
            ['/music/valid.mp3', song('valid'), 1],
            ['/music/infinity.mp3', song('infinity'), 1],
        ]);
        malformed.files['/music/nan.mp3']!.addedAt = Number.NaN;
        malformed.files['/music/valid.mp3']!.addedAt = 100;
        malformed.files['/music/infinity.mp3']!.addedAt =
            Number.POSITIVE_INFINITY;

        expect(
            sortedMusicList(malformed, {
                by: 'addedAt',
                desc: false,
            }).map(item => item.id),
        ).toEqual(['valid', 'nan', 'infinity']);
    });

    it.each([
        [false, ['early', 'late', 'missing']],
        [true, ['late', 'early', 'missing']],
    ] as const)('addedAt 元数据缺失时在 desc=%s 仍置末', (desc, expected) => {
        const incomplete = libraryOf([
            ['/music/early.mp3', song('early'), 1],
            ['/music/missing.mp3', song('missing'), 1],
            ['/music/late.mp3', song('late'), 1],
        ]);
        incomplete.files['/music/early.mp3']!.addedAt = 100;
        incomplete.files['/music/late.mp3']!.addedAt = 200;
        delete incomplete.files['/music/missing.mp3'];

        expect(
            sortedMusicList(incomplete, {
                by: 'addedAt',
                desc,
            }).map(item => item.id),
        ).toEqual(expected);
    });
});
