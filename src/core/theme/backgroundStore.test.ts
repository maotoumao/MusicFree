import {
    copyFile,
    exists,
    mkdir,
    moveFile,
    readDir,
    stat,
    unlink,
    writeFile,
} from '@dr.pogodin/react-native-fs';

import {
    cleanupBackgroundImages,
    persistBackgroundBitmap,
    persistBackgroundSource,
    removeBackgroundImage,
    resolveBackgroundImageUri,
    scanBackgroundImages,
} from './backgroundStore';

jest.mock('@/infra/paths', () => ({ basePath: '/base' }));
jest.mock('@dr.pogodin/react-native-fs', () => ({
    copyFile: jest.fn(),
    exists: jest.fn(),
    mkdir: jest.fn(),
    moveFile: jest.fn(),
    readDir: jest.fn(),
    stat: jest.fn(),
    unlink: jest.fn(),
    writeFile: jest.fn(),
}));

const BACKGROUND_DIR = '/base/theme-background';
const mockExists = jest.mocked(exists);
const mockStat = jest.mocked(stat);
const mockMkdir = jest.mocked(mkdir);
const mockCopyFile = jest.mocked(copyFile);
const mockMoveFile = jest.mocked(moveFile);
const mockReadDir = jest.mocked(readDir);
const mockUnlink = jest.mocked(unlink);
const mockWriteFile = jest.mocked(writeFile);

function resolvedStat(size: number): Awaited<ReturnType<typeof stat>> {
    return { size } as unknown as Awaited<ReturnType<typeof stat>>;
}

function dirEntry(
    name: string,
    isFile = true,
): Awaited<ReturnType<typeof readDir>>[number] {
    return {
        name,
        path: `${BACKGROUND_DIR}/${name}`,
        size: 42,
        mtime: null,
        ctime: null,
        isFile: () => isFile,
        isDirectory: () => !isFile,
    };
}

beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(1000);
    mockExists.mockResolvedValue(true);
    mockStat.mockResolvedValue(resolvedStat(42));
    mockMkdir.mockResolvedValue(undefined);
    mockCopyFile.mockResolvedValue(undefined);
    mockMoveFile.mockResolvedValue(undefined);
    mockReadDir.mockResolvedValue([]);
    mockUnlink.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('persistBackgroundSource', () => {
    it('复制到临时文件后 move 发布，并只返回托管文件名', async () => {
        const fileName = await persistBackgroundSource(
            'file:///cache/picked.jpg',
            'wallpaper.jpg',
        );
        const [source, temporary] = mockCopyFile.mock.calls[0]!;
        const [temporaryAgain, destination] = mockMoveFile.mock.calls[0]!;

        expect(source).toBe('/cache/picked.jpg');
        expect(temporary).toBe(temporaryAgain);
        expect(fileName).toMatch(/^source-[0-9a-f-]+\.jpg$/);
        expect(temporary).toBe(`${BACKGROUND_DIR}/.tmp-${fileName}`);
        expect(destination).toBe(`${BACKGROUND_DIR}/${fileName}`);
        expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('优先原始文件名扩展名并规范为小写', async () => {
        const fileName = await persistBackgroundSource(
            'file:///cache/picked.tmp',
            'wallpaper.JPEG',
        );

        expect(fileName.endsWith('.jpeg')).toBe(true);
    });

    it('原始名无有效扩展时从 URI 推导并剥离 query 与 fragment', async () => {
        const fileName = await persistBackgroundSource(
            'file:///cache/picked.PNG?size=large#preview',
            'wallpaper',
        );

        expect(mockExists).toHaveBeenCalledWith('/cache/picked.PNG');
        expect(fileName.endsWith('.png')).toBe(true);
    });

    it('解码 iOS picker 返回的百分号编码本地路径', async () => {
        await persistBackgroundSource(
            'file:///cache/%E8%83%8C%E6%99%AF%20%E5%9B%BE.jpg',
            'wallpaper.jpg',
        );

        expect(mockExists).toHaveBeenCalledWith('/cache/背景 图.jpg');
        expect(mockCopyFile).toHaveBeenCalledWith(
            '/cache/背景 图.jpg',
            expect.any(String),
        );
    });

    it('推不出安全扩展名时仍可发布无扩展名文件', async () => {
        const fileName = await persistBackgroundSource(
            'file:///cache/picked.longextensionname',
            'wallpaper.bad-ext',
        );

        expect(fileName).toMatch(/^source-[0-9a-f-]+$/);
    });

    it('并发发布产生不同文件名', async () => {
        const [first, second] = await Promise.all([
            persistBackgroundSource('file:///cache/a.jpg', 'a.jpg'),
            persistBackgroundSource('file:///cache/b.jpg', 'b.jpg'),
        ]);

        expect(first).not.toBe(second);
        expect(mockCopyFile.mock.calls[0]![1]).not.toBe(
            mockCopyFile.mock.calls[1]![1],
        );
    });

    it('目录不存在时在复制前创建', async () => {
        mockExists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

        await persistBackgroundSource('file:///cache/a.jpg', 'a.jpg');

        expect(mockMkdir).toHaveBeenCalledWith(BACKGROUND_DIR);
        expect(mockMkdir.mock.invocationCallOrder[0]!).toBeLessThan(
            mockCopyFile.mock.invocationCallOrder[0]!,
        );
    });

    it('拒绝非 file URI 与空路径，且不访问文件系统', async () => {
        await expect(
            persistBackgroundSource('content://media/1', 'a.jpg'),
        ).rejects.toThrow('背景图片源必须是 file:// URI');
        await expect(
            persistBackgroundSource('file://', 'a.jpg'),
        ).rejects.toThrow('背景图片源路径不能为空');
        expect(mockExists).not.toHaveBeenCalled();
    });

    it('源不存在或为空时拒绝且不创建目录', async () => {
        mockExists.mockResolvedValueOnce(false);
        await expect(
            persistBackgroundSource('file:///cache/missing.jpg'),
        ).rejects.toThrow('背景图片源不可读或为空');
        expect(mockStat).not.toHaveBeenCalled();

        jest.resetAllMocks();
        mockExists.mockResolvedValue(true);
        mockStat.mockResolvedValue(resolvedStat(0));
        await expect(
            persistBackgroundSource('file:///cache/empty.jpg'),
        ).rejects.toThrow('背景图片源不可读或为空');
        expect(mockMkdir).not.toHaveBeenCalled();
    });

    it('复制失败时清理临时文件并保留原始错误', async () => {
        mockCopyFile.mockRejectedValue(new Error('disk full'));
        mockUnlink.mockRejectedValue(new Error('cleanup failed'));

        await expect(
            persistBackgroundSource('file:///cache/a.jpg', 'a.jpg'),
        ).rejects.toThrow('disk full');
        expect(mockMoveFile).not.toHaveBeenCalled();
        expect(mockUnlink).toHaveBeenCalledWith(
            expect.stringMatching(`${BACKGROUND_DIR}/\\.tmp-source-`),
        );
    });

    it('move 失败时清理临时文件并抛出 move 错误', async () => {
        mockMoveFile.mockRejectedValue(new Error('move failed'));

        await expect(
            persistBackgroundSource('file:///cache/a.jpg', 'a.jpg'),
        ).rejects.toThrow('move failed');
        expect(mockUnlink).toHaveBeenCalledTimes(1);
    });
});

describe('persistBackgroundBitmap', () => {
    it('写入临时文件后 move 发布，固定 jpg 扩展名', async () => {
        const fileName = await persistBackgroundBitmap('YmFzZTY0');
        const [temporary, data, encoding] = mockWriteFile.mock.calls[0]!;
        const [temporaryAgain, destination] = mockMoveFile.mock.calls[0]!;

        expect(fileName).toMatch(/^background-[0-9a-f-]+\.jpg$/);
        expect(data).toBe('YmFzZTY0');
        expect(encoding).toBe('base64');
        expect(temporary).toBe(temporaryAgain);
        expect(temporary).toBe(`${BACKGROUND_DIR}/.tmp-${fileName}`);
        expect(destination).toBe(`${BACKGROUND_DIR}/${fileName}`);
    });

    it('空内容直接拒绝，不触碰文件系统', async () => {
        await expect(persistBackgroundBitmap('')).rejects.toThrow(
            '背景位图内容为空',
        );
        expect(mockWriteFile).not.toHaveBeenCalled();
        expect(mockMkdir).not.toHaveBeenCalled();
    });

    it('写入失败时清理临时文件并保留原始错误', async () => {
        mockWriteFile.mockRejectedValue(new Error('disk full'));

        await expect(persistBackgroundBitmap('YmFzZTY0')).rejects.toThrow(
            'disk full',
        );
        expect(mockMoveFile).not.toHaveBeenCalled();
        expect(mockUnlink).toHaveBeenCalledWith(
            expect.stringMatching(`${BACKGROUND_DIR}/\\.tmp-background-`),
        );
    });
});

describe('removeBackgroundImage', () => {
    it('删除托管目录内的直属文件', async () => {
        await removeBackgroundImage('background-rs-1.jpg');

        expect(mockUnlink).toHaveBeenCalledWith(
            `${BACKGROUND_DIR}/background-rs-1.jpg`,
        );
    });

    it.each([
        '',
        '.',
        '..',
        '.tmp-background-rs-1.jpg',
        '../outside.jpg',
        'sub/child.jpg',
        'sub\\child.jpg',
        'bad\u0000name.jpg',
        'bad\uD800name.jpg',
        '中'.repeat(86),
    ])('拒绝不安全文件名 %#', async fileName => {
        await removeBackgroundImage(fileName);

        expect(mockExists).not.toHaveBeenCalled();
        expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('文件不存在或删除失败都安静完成', async () => {
        mockExists.mockResolvedValueOnce(false);
        await expect(
            removeBackgroundImage('background-rs-1.jpg'),
        ).resolves.toBeUndefined();
        expect(mockUnlink).not.toHaveBeenCalled();

        mockExists.mockRejectedValueOnce(new Error('io failed'));
        await expect(
            removeBackgroundImage('background-rs-2.jpg'),
        ).resolves.toBeUndefined();
    });
});

describe('resolveBackgroundImageUri', () => {
    it('安全文件名解析为主题目录 file URI', () => {
        expect(resolveBackgroundImageUri('background-rs-1.webp')).toBe(
            `file://${BACKGROUND_DIR}/background-rs-1.webp`,
        );
    });

    it('不安全文件名不产生 URI', () => {
        expect(resolveBackgroundImageUri('../outside.jpg')).toBeUndefined();
        expect(resolveBackgroundImageUri('bad\uD800name.jpg')).toBeUndefined();
    });

    it.each([
        ['cover#1.jpg', 'cover%231.jpg'],
        ['cover?size=1.jpg', 'cover%3Fsize%3D1.jpg'],
        ['cover%2Fname.jpg', 'cover%252Fname.jpg'],
        ['背景 图.jpg', '%E8%83%8C%E6%99%AF%20%E5%9B%BE.jpg'],
    ])('编码文件名单段中的 URI 保留字符 %#', (fileName, encoded) => {
        expect(resolveBackgroundImageUri(fileName)).toBe(
            `file://${BACKGROUND_DIR}/${encoded}`,
        );
    });
});

describe('scanBackgroundImages', () => {
    const REFERENCED_BITMAP =
        'background-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';
    const REFERENCED_SOURCE = 'source-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png';

    it('保留全部被引用文件，只把精确匹配的临时与孤立托管文件列为候选', async () => {
        mockReadDir.mockResolvedValue([
            dirEntry(REFERENCED_BITMAP),
            dirEntry(REFERENCED_SOURCE),
            dirEntry(
                '.tmp-background-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png',
            ),
            dirEntry('background-cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp'),
            dirEntry('source-cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp'),
            dirEntry('background-a.jpg'),
            dirEntry('background----.txt'),
            dirEntry('background-dddddddd-dddd-1ddd-8ddd-dddddddddddd.jpg'),
            dirEntry('background-eeeeeeee-eeee-4eee-7eee-eeeeeeeeeeee.jpg'),
            dirEntry(
                'background-ffffffff-ffff-4fff-8fff-ffffffffffff.abcdefghijk',
            ),
            dirEntry('unrelated.txt'),
            dirEntry(
                'background-dddddddd-dddd-4ddd-8ddd-dddddddddddd.jpg',
                false,
            ),
        ]);

        await expect(
            scanBackgroundImages(
                new Set([REFERENCED_BITMAP, REFERENCED_SOURCE]),
            ),
        ).resolves.toEqual({
            readable: true,
            missingFileNames: [],
            staleFileNames: [
                '.tmp-background-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png',
                'background-cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp',
                'source-cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp',
            ],
        });
        expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('引用文件不在目录中时逐个报告缺失', async () => {
        mockReadDir.mockResolvedValue([dirEntry(REFERENCED_SOURCE)]);

        await expect(
            scanBackgroundImages(
                new Set([REFERENCED_BITMAP, REFERENCED_SOURCE]),
            ),
        ).resolves.toEqual({
            readable: true,
            missingFileNames: [REFERENCED_BITMAP],
            staleFileNames: [],
        });
    });

    it('无引用时把全部托管残留列为候选', async () => {
        mockReadDir.mockResolvedValue([
            dirEntry(REFERENCED_BITMAP),
            dirEntry(
                '.tmp-background-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png',
            ),
        ]);

        await expect(scanBackgroundImages(new Set())).resolves.toEqual({
            readable: true,
            missingFileNames: [],
            staleFileNames: [
                REFERENCED_BITMAP,
                '.tmp-background-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png',
            ],
        });
    });

    it('目录不存在时全部引用都算缺失，且不调用 readDir', async () => {
        mockExists.mockResolvedValueOnce(false);

        await expect(
            scanBackgroundImages(new Set([REFERENCED_BITMAP])),
        ).resolves.toEqual({
            readable: true,
            missingFileNames: [REFERENCED_BITMAP],
            staleFileNames: [],
        });
        expect(mockReadDir).not.toHaveBeenCalled();
    });

    it('目录检查或读取失败时结论不可信，不清理文件', async () => {
        mockExists.mockRejectedValueOnce(new Error('exists failed'));
        await expect(
            scanBackgroundImages(new Set([REFERENCED_BITMAP])),
        ).resolves.toEqual({
            readable: false,
            missingFileNames: [],
            staleFileNames: [],
        });

        mockExists.mockResolvedValueOnce(true);
        mockReadDir.mockRejectedValueOnce(new Error('read failed'));
        await expect(
            scanBackgroundImages(new Set([REFERENCED_BITMAP])),
        ).resolves.toEqual({
            readable: false,
            missingFileNames: [],
            staleFileNames: [],
        });
        expect(mockUnlink).not.toHaveBeenCalled();
    });
});

describe('cleanupBackgroundImages', () => {
    it('单个残留删除失败不影响后续清理与最终判定', async () => {
        mockUnlink
            .mockRejectedValueOnce(new Error('busy'))
            .mockResolvedValueOnce(undefined);

        await cleanupBackgroundImages(
            [
                '.tmp-background-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg',
                'background-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg',
            ],
            () => true,
        );
        expect(mockUnlink).toHaveBeenCalledTimes(2);
    });

    it('计划失效时立即停止，且再次过滤非托管候选', async () => {
        const isPlanCurrent = jest
            .fn()
            .mockReturnValueOnce(true)
            .mockReturnValueOnce(false);

        await cleanupBackgroundImages(
            [
                'unrelated.txt',
                'background-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg',
                'background-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg',
            ],
            isPlanCurrent,
        );

        expect(mockUnlink).not.toHaveBeenCalled();
        expect(isPlanCurrent).toHaveBeenCalledTimes(2);
    });
});
