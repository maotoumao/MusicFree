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

import {
    deleteCustomLyric,
    pruneLyricCache,
    readCachedLyric,
    readCustomLyric,
    writeCachedLyric,
    writeCachedMiss,
    writeCustomLyric,
} from './fileStore';

import type { MediaRef } from '@/types';

jest.mock('../../infra/paths', () => ({ lyricDir: '/base/lyric' }));
jest.mock('@dr.pogodin/react-native-fs', () => ({
    exists: jest.fn(),
    mkdir: jest.fn(),
    moveFile: jest.fn(),
    readDir: jest.fn(),
    readFile: jest.fn(),
    stat: jest.fn(),
    touch: jest.fn(),
    unlink: jest.fn(),
    writeFile: jest.fn(),
}));

const CUSTOM_DIR = '/base/lyric/custom';
const CACHE_DIR = '/base/lyric/cache';

const mockExists = jest.mocked(exists);
const mockMkdir = jest.mocked(mkdir);
const mockMoveFile = jest.mocked(moveFile);
const mockReadDir = jest.mocked(readDir);
const mockReadFile = jest.mocked(readFile);
const mockStat = jest.mocked(stat);
const mockTouch = jest.mocked(touch);
const mockUnlink = jest.mocked(unlink);
const mockWriteFile = jest.mocked(writeFile);

const REF: MediaRef = { platform: 'demo', id: '1' };
const OTHER: MediaRef = { platform: 'demo', id: '2' };
/** 与 utils/media 的 golden test 同源；此处只需一个确定的文件名 */
const REF_NAME =
    '921f41020d8f180a755310cf2b26b151c8f473d315e0caaf9342e83baafe58b6.json';

/** 取第 call 次调用的第 index 个参数并字符串化；越界回空串，让断言失败而不是类型报错 */
function argAt(calls: unknown[][], call: number, index: number): string {
    return String(calls[call]?.[index] ?? '');
}

/** 所有写入过的路径 */
function written(): string[] {
    return mockWriteFile.mock.calls.map((_call, index) =>
        argAt(mockWriteFile.mock.calls, index, 0),
    );
}

/** 所有删除过的路径 */
function unlinked(): string[] {
    return mockUnlink.mock.calls.map((_call, index) =>
        argAt(mockUnlink.mock.calls, index, 0),
    );
}

type DirEntries = Awaited<ReturnType<typeof readDir>>;

function fileEntry(name: string, mtimeMs: number) {
    return {
        name,
        mtime: new Date(mtimeMs),
        isFile: () => true,
        isDirectory: () => false,
    };
}

/** 名字碰巧匹配的目录：RNFS 的 unlink 对目录是递归删除，必须被挡住 */
function dirEntryNamedLikeFile(name: string) {
    return {
        name,
        mtime: new Date(0),
        isFile: () => false,
        isDirectory: () => true,
    };
}

function asEntries(items: { name: string }[]): DirEntries {
    return items as unknown as DirEntries;
}

function statWithMtime(msAgo: number): Awaited<ReturnType<typeof stat>> {
    return {
        mtime: new Date(Date.now() - msAgo),
    } as unknown as Awaited<ReturnType<typeof stat>>;
}

beforeEach(() => {
    jest.resetAllMocks();
    mockExists.mockResolvedValue(true);
    mockMkdir.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockMoveFile.mockResolvedValue(undefined);
    mockTouch.mockResolvedValue(undefined);
    mockReadDir.mockResolvedValue(asEntries([]));
});

describe('自定义歌词', () => {
    it('先写临时文件再 move 到目的名，不直接覆写', async () => {
        await writeCustomLyric(REF, { rawLrc: '[00:01.00]a' });

        expect(written()).toEqual([`${CUSTOM_DIR}/${REF_NAME}.writing`]);
        expect(argAt(mockWriteFile.mock.calls, 0, 1)).toBe(
            JSON.stringify({ rawLrc: '[00:01.00]a' }),
        );
        expect(mockMoveFile).toHaveBeenCalledWith(
            `${CUSTOM_DIR}/${REF_NAME}.writing`,
            `${CUSTOM_DIR}/${REF_NAME}`,
        );
    });

    it('move 失败（iOS 目的已存在）时删掉旧文件再 move 一次', async () => {
        mockMoveFile
            .mockRejectedValueOnce(new Error('dest exists'))
            .mockResolvedValueOnce(undefined);

        await writeCustomLyric(REF, { rawLrc: 'a' });

        expect(unlinked()).toEqual([`${CUSTOM_DIR}/${REF_NAME}`]);
        expect(mockMoveFile).toHaveBeenCalledTimes(2);
    });

    it('写临时文件失败时向上抛，旧文件不受影响', async () => {
        mockWriteFile.mockRejectedValue(new Error('boom'));

        await expect(writeCustomLyric(REF, { rawLrc: 'a' })).rejects.toThrow(
            'boom',
        );
        expect(mockUnlink).not.toHaveBeenCalled();
        expect(mockMoveFile).not.toHaveBeenCalled();
    });

    it('两次 move 都失败时清掉临时文件并抛出', async () => {
        mockMoveFile.mockRejectedValue(new Error('io'));

        await expect(writeCustomLyric(REF, { rawLrc: 'a' })).rejects.toThrow(
            'io',
        );
        expect(unlinked()).toContain(`${CUSTOM_DIR}/${REF_NAME}.writing`);
    });

    it('读回正文与译文', async () => {
        mockReadFile.mockResolvedValue(
            JSON.stringify({ rawLrc: 'a', translation: 'b' }),
        );

        await expect(readCustomLyric(REF)).resolves.toEqual({
            rawLrc: 'a',
            translation: 'b',
        });
    });

    it('不同歌不撞名', async () => {
        await writeCustomLyric(REF, { rawLrc: 'a' });
        await writeCustomLyric(OTHER, { rawLrc: 'b' });

        const [first, second] = written();
        expect(second).not.toBe(first);
    });

    it('文件不存在时返回 null', async () => {
        mockExists.mockResolvedValue(false);

        await expect(readCustomLyric(REF)).resolves.toBeNull();
        expect(mockReadFile).not.toHaveBeenCalled();
    });

    it('内容损坏只当没有，不把异常抛给取词链', async () => {
        mockReadFile.mockResolvedValue('{ 不是 json');

        await expect(readCustomLyric(REF)).resolves.toBeNull();
    });

    it('形状不对（缺 rawLrc）同样当没有', async () => {
        mockReadFile.mockResolvedValue(JSON.stringify({ translation: 'b' }));

        await expect(readCustomLyric(REF)).resolves.toBeNull();
    });

    it('删除是 best-effort，删不掉也不抛', async () => {
        mockUnlink.mockRejectedValue(new Error('locked'));

        await expect(deleteCustomLyric(REF)).resolves.toBeUndefined();
    });
});

describe('缓存', () => {
    it('命中时 touch mtime，让淘汰按「最后使用」而不是「写入时间」排序', async () => {
        mockReadFile.mockResolvedValue(JSON.stringify({ rawLrc: 'a' }));

        await expect(readCachedLyric(REF)).resolves.toEqual({
            kind: 'hit',
            text: { rawLrc: 'a' },
        });
        expect(mockTouch).toHaveBeenCalledTimes(1);
        expect(argAt(mockTouch.mock.calls, 0, 0)).toBe(
            `${CACHE_DIR}/${REF_NAME}`,
        );
    });

    it('没有正文也没有标记时是 absent', async () => {
        mockExists.mockResolvedValue(false);

        await expect(readCachedLyric(REF)).resolves.toEqual({
            kind: 'absent',
        });
    });

    it('正文损坏时清掉它并返回 absent，不去看负缓存标记', async () => {
        mockReadFile.mockResolvedValue('坏的');
        // 若误去看标记，这个未过期的标记会让结果变成 none
        mockStat.mockResolvedValue(statWithMtime(1000));

        await expect(readCachedLyric(REF)).resolves.toEqual({
            kind: 'absent',
        });
        expect(unlinked()).toEqual([`${CACHE_DIR}/${REF_NAME}`]);
    });

    it('负缓存未过期时是 none，省下这次请求', async () => {
        // 正文不存在、标记存在且是刚写的
        mockExists.mockImplementation(async path =>
            String(path).endsWith('.none'),
        );
        mockStat.mockResolvedValue(statWithMtime(1000));

        await expect(readCachedLyric(REF)).resolves.toEqual({ kind: 'none' });
    });

    it('负缓存过期后退回 absent 并清掉标记，让插件有机会重试', async () => {
        mockExists.mockImplementation(async path =>
            String(path).endsWith('.none'),
        );
        mockStat.mockResolvedValue(statWithMtime(25 * 60 * 60 * 1000));

        await expect(readCachedLyric(REF)).resolves.toEqual({
            kind: 'absent',
        });
        expect(unlinked().some(path => path.endsWith('.none'))).toBe(true);
    });

    it('写入正文时清掉负缓存标记，保持正负两态互斥', async () => {
        await writeCachedLyric(REF, { rawLrc: 'a' });

        expect(unlinked().some(path => path.endsWith('.none'))).toBe(true);
    });

    it('记负缓存时清掉正文，保持正负两态互斥', async () => {
        await writeCachedMiss(REF);

        expect(argAt(mockWriteFile.mock.calls, 0, 0).endsWith('.none')).toBe(
            true,
        );
        expect(argAt(mockWriteFile.mock.calls, 0, 1)).toBe('');
        expect(unlinked()).toEqual([`${CACHE_DIR}/${REF_NAME}`]);
    });

    it('记负缓存失败不抛：下次多请求一次而已，不该打断取词', async () => {
        mockWriteFile.mockRejectedValue(new Error('disk full'));

        await expect(writeCachedMiss(REF)).resolves.toBeUndefined();
    });

    it('建目录失败同样不抛（首次运行且存储不可用）', async () => {
        mockMkdir.mockRejectedValue(new Error('no space'));

        await expect(writeCachedMiss(REF)).resolves.toBeUndefined();
        expect(mockWriteFile).not.toHaveBeenCalled();
    });
});

describe('备份策略（iOS）', () => {
    /**
     * 排除属性只能随 mkdir 设置。若 ensureDir 加了 exists 守卫，
     * 目录已存在时就跳过 mkdir、属性永远补不上——这条断言锁住「无条件 mkdir」
     */
    it('目录已存在也照样 mkdir，让属性能自愈', async () => {
        mockExists.mockResolvedValue(true);

        await writeCachedLyric(REF, { rawLrc: 'a' });

        expect(mockMkdir).toHaveBeenCalledTimes(1);
    });

    it('cache 排除备份：这些词能重新取回，不该占用户的 iCloud 空间', async () => {
        await writeCachedLyric(REF, { rawLrc: 'a' });

        expect(mockMkdir).toHaveBeenCalledWith(CACHE_DIR, {
            NSURLIsExcludedFromBackupKey: true,
        });
    });

    it('custom 留在备份内：手工编辑的词不可再生，正好由系统备份兜住', async () => {
        await writeCustomLyric(REF, { rawLrc: 'a' });

        expect(mockMkdir).toHaveBeenCalledWith(CUSTOM_DIR, {
            NSURLIsExcludedFromBackupKey: false,
        });
    });
});

describe('淘汰', () => {
    it('未超上限时一个都不删', async () => {
        mockReadDir.mockResolvedValue(
            asEntries(
                Array.from({ length: 10 }, (_unused, i) =>
                    fileEntry(`${'0'.repeat(63)}${i}.json`, i),
                ),
            ),
        );

        await pruneLyricCache();

        expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('超上限时按 mtime 最旧优先清到留存线以下', async () => {
        // 5001 条：上限 5000、留存 4000，应删掉最旧的 1001 条
        const entries = Array.from({ length: 5001 }, (_unused, i) =>
            fileEntry(`${i.toString(16).padStart(64, '0')}.json`, i),
        );
        const oldest = entries[0]?.name ?? '';
        const newest = entries.at(-1)?.name ?? '';
        mockReadDir.mockResolvedValue(asEntries(entries));

        await pruneLyricCache();

        expect(mockUnlink).toHaveBeenCalledTimes(1001);
        const deleted = unlinked();
        expect(deleted[0]).toBe(`${CACHE_DIR}/${oldest}`);
        expect(deleted).not.toContain(`${CACHE_DIR}/${newest}`);
    });

    it('名字碰巧匹配的目录不删：RNFS 的 unlink 对目录是递归删除', async () => {
        const entries = [
            ...Array.from({ length: 5001 }, (_unused, i) =>
                fileEntry(`${i.toString(16).padStart(64, '0')}.json`, i + 1),
            ),
            dirEntryNamedLikeFile(`${'f'.repeat(64)}.json`),
        ];
        mockReadDir.mockResolvedValue(asEntries(entries));

        await pruneLyricCache();

        expect(unlinked()).not.toContain(`${CACHE_DIR}/${'f'.repeat(64)}.json`);
    });

    it('目录还不存在时安静返回', async () => {
        mockReadDir.mockRejectedValue(new Error('ENOENT'));

        await expect(pruneLyricCache()).resolves.toBeUndefined();
    });
});
