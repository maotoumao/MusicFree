import {
    copyFile,
    exists,
    mkdir,
    moveFile,
    stat,
    unlink,
} from '@dr.pogodin/react-native-fs';

import { persistArtwork, removeArtwork } from './artworkStore';

jest.mock('../../infra/paths', () => ({ basePath: '/base' }));
jest.mock('@dr.pogodin/react-native-fs', () => ({
    copyFile: jest.fn(),
    exists: jest.fn(),
    mkdir: jest.fn(),
    moveFile: jest.fn(),
    stat: jest.fn(),
    unlink: jest.fn(),
}));

const ART_DIR = '/base/playlist-artwork';

const mockExists = jest.mocked(exists);
const mockStat = jest.mocked(stat);
const mockMkdir = jest.mocked(mkdir);
const mockCopyFile = jest.mocked(copyFile);
const mockMoveFile = jest.mocked(moveFile);
const mockUnlink = jest.mocked(unlink);

/** 构造 stat 返回值，仅关心 size */
function resolvedStat(size: number): Awaited<ReturnType<typeof stat>> {
    return { size } as unknown as Awaited<ReturnType<typeof stat>>;
}

beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(1000);
    // 默认：目录/源存在、源非空、文件操作成功
    mockExists.mockResolvedValue(true);
    mockStat.mockResolvedValue(resolvedStat(42));
    mockMkdir.mockResolvedValue(undefined);
    mockCopyFile.mockResolvedValue(undefined);
    mockMoveFile.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('persistArtwork', () => {
    it('复制源到临时文件再原子 move 成托管文件，返回 file:// 路径', async () => {
        const result = await persistArtwork(
            '42',
            'file:///cache/pick.jpg',
            'cover.jpg',
        );
        const [source, temp] = mockCopyFile.mock.calls[0]!;
        const [tempAgain, dest] = mockMoveFile.mock.calls[0]!;
        expect(source).toBe('/cache/pick.jpg');
        expect(temp).toBe(tempAgain);
        expect(result).toBe(`file://${dest}`);
        expect(dest.startsWith(`${ART_DIR}/42-`)).toBe(true);
        expect(dest.endsWith('.jpg')).toBe(true);
        // temp 与 dest 同名，仅多 .tmp- 前缀
        expect(temp).toBe(`${ART_DIR}/.tmp-${dest.slice(ART_DIR.length + 1)}`);
        expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('缺 fileName 时从 sourceUri 推扩展名，并剥掉 #fragment 与 ?query', async () => {
        const result = await persistArtwork(
            '7',
            'file:///cache/pic.PNG?x=1#123',
        );
        expect(mockExists).toHaveBeenCalledWith('/cache/pic.PNG');
        const [source] = mockCopyFile.mock.calls[0]!;
        expect(source).toBe('/cache/pic.PNG');
        expect(result.startsWith(`file://${ART_DIR}/7-`)).toBe(true);
        expect(result.endsWith('.png')).toBe(true);
    });

    it('fileName 含 # 时仍取到扩展名（文件名不当作 URI 剥离）', async () => {
        const result = await persistArtwork(
            '9',
            'file:///cache/pick.tmp',
            'cover#v2.jpg',
        );
        expect(result.endsWith('.jpg')).toBe(true);
    });

    it('fileName 无扩展名时回退用 sourceUri 的扩展名', async () => {
        const result = await persistArtwork(
            '9',
            'file:///cache/real.png',
            'picked',
        );
        expect(result.endsWith('.png')).toBe(true);
    });

    it('id 含非法文件名字符替为 _，推不出扩展名时省略', async () => {
        const result = await persistArtwork('a/b:c', 'file:///cache/noext');
        const [, dest] = mockMoveFile.mock.calls[0]!;
        expect(result).toBe(`file://${dest}`);
        expect(dest.startsWith(`${ART_DIR}/a_b_c-`)).toBe(true);
        expect(dest.includes('.')).toBe(false);
    });

    it('连续两次保存产生不同的临时/最终/返回路径（不依赖时钟）', async () => {
        const first = await persistArtwork('5', 'file:///cache/x.jpg', 'a.jpg');
        const second = await persistArtwork(
            '5',
            'file:///cache/x.jpg',
            'a.jpg',
        );
        expect(first).not.toBe(second);
        expect(mockCopyFile.mock.calls[0]![1]).not.toBe(
            mockCopyFile.mock.calls[1]![1],
        );
        expect(mockMoveFile.mock.calls[0]![1]).not.toBe(
            mockMoveFile.mock.calls[1]![1],
        );
    });

    it('按 exists→stat→exists(dir)→mkdir→copy→move 顺序执行', async () => {
        mockExists.mockReset();
        mockExists
            .mockResolvedValueOnce(true) // 源可读
            .mockResolvedValueOnce(false); // 目录不存在
        await persistArtwork('1', 'file:///cache/x.jpg', 'a.jpg');
        const eo = mockExists.mock.invocationCallOrder;
        expect(eo[0]!).toBeLessThan(mockStat.mock.invocationCallOrder[0]!);
        expect(mockStat.mock.invocationCallOrder[0]!).toBeLessThan(eo[1]!);
        expect(eo[1]!).toBeLessThan(mockMkdir.mock.invocationCallOrder[0]!);
        expect(mockMkdir.mock.invocationCallOrder[0]!).toBeLessThan(
            mockCopyFile.mock.invocationCallOrder[0]!,
        );
        expect(mockCopyFile.mock.invocationCallOrder[0]!).toBeLessThan(
            mockMoveFile.mock.invocationCallOrder[0]!,
        );
    });

    it('目录已存在时不 mkdir', async () => {
        await persistArtwork('1', 'file:///cache/x.jpg', 'a.jpg');
        expect(mockMkdir).not.toHaveBeenCalled();
    });

    it('源不存在时 reject，且不 stat / mkdir / 复制 / move', async () => {
        mockExists.mockReset();
        mockExists.mockResolvedValue(false);
        await expect(
            persistArtwork('1', 'file:///cache/x.jpg'),
        ).rejects.toThrow('封面源不可读或为空');
        expect(mockStat).not.toHaveBeenCalled();
        expect(mockMkdir).not.toHaveBeenCalled();
        expect(mockCopyFile).not.toHaveBeenCalled();
        expect(mockMoveFile).not.toHaveBeenCalled();
    });

    it('源为空文件（size 0）时 reject，且不 mkdir / 复制', async () => {
        mockStat.mockReset();
        mockStat.mockResolvedValue(resolvedStat(0));
        await expect(
            persistArtwork('1', 'file:///cache/x.jpg'),
        ).rejects.toThrow('封面源不可读或为空');
        expect(mockMkdir).not.toHaveBeenCalled();
        expect(mockCopyFile).not.toHaveBeenCalled();
    });

    it('stat 失败时 reject，且不 mkdir / 复制', async () => {
        mockStat.mockReset();
        mockStat.mockRejectedValue(new Error('stat failed'));
        await expect(
            persistArtwork('1', 'file:///cache/x.jpg'),
        ).rejects.toThrow('stat failed');
        expect(mockMkdir).not.toHaveBeenCalled();
        expect(mockCopyFile).not.toHaveBeenCalled();
    });

    it('复制失败时清理临时文件并抛错，不 move', async () => {
        mockCopyFile.mockReset();
        mockCopyFile.mockRejectedValue(new Error('disk full'));
        await expect(
            persistArtwork('1', 'file:///cache/x.jpg', 'a.jpg'),
        ).rejects.toThrow('disk full');
        expect(mockMoveFile).not.toHaveBeenCalled();
        expect(mockUnlink).toHaveBeenCalledTimes(1);
        const [temp] = mockUnlink.mock.calls[0]!;
        expect(temp.startsWith(`${ART_DIR}/.tmp-1-`)).toBe(true);
    });

    it('move 失败时清理临时文件并抛错', async () => {
        mockMoveFile.mockReset();
        mockMoveFile.mockRejectedValue(new Error('rename failed'));
        await expect(
            persistArtwork('1', 'file:///cache/x.jpg', 'a.jpg'),
        ).rejects.toThrow('rename failed');
        const [temp] = mockUnlink.mock.calls[0]!;
        expect(temp.startsWith(`${ART_DIR}/.tmp-1-`)).toBe(true);
    });

    it('临时文件清理自身失败时，仍抛出原始复制错误', async () => {
        mockCopyFile.mockReset();
        mockCopyFile.mockRejectedValue(new Error('copy boom'));
        mockUnlink.mockReset();
        mockUnlink.mockRejectedValue(new Error('unlink boom'));
        await expect(
            persistArtwork('1', 'file:///cache/x.jpg', 'a.jpg'),
        ).rejects.toThrow('copy boom');
    });
});

describe('removeArtwork', () => {
    it('删除托管目录内的封面文件', async () => {
        await removeArtwork(`file://${ART_DIR}/5-abc.jpg`);
        expect(mockUnlink).toHaveBeenCalledWith(`${ART_DIR}/5-abc.jpg`);
    });

    it('拒绝删除托管目录外的路径', async () => {
        await removeArtwork('file:///data/other/x.jpg');
        expect(mockExists).not.toHaveBeenCalled();
        expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('拒绝路径穿越（.. / 目录本身 / 含分隔符）', async () => {
        await removeArtwork(`file://${ART_DIR}/..`);
        await removeArtwork(`file://${ART_DIR}/../other`);
        await removeArtwork(`file://${ART_DIR}/sub/child.jpg`);
        await removeArtwork(`file://${ART_DIR}/`);
        expect(mockExists).not.toHaveBeenCalled();
        expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('相似前缀目录不误判为托管目录', async () => {
        await removeArtwork('file:///base/playlist-artwork-evil/x.jpg');
        expect(mockExists).not.toHaveBeenCalled();
        expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('文件不存在时不 unlink', async () => {
        mockExists.mockReset();
        mockExists.mockResolvedValue(false);
        await removeArtwork(`file://${ART_DIR}/gone.jpg`);
        expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('unlink 失败时吞掉错误不抛（best-effort）', async () => {
        mockUnlink.mockReset();
        mockUnlink.mockRejectedValue(new Error('EBUSY'));
        await expect(
            removeArtwork(`file://${ART_DIR}/x.jpg`),
        ).resolves.toBeUndefined();
    });

    it('exists 失败也吞掉不抛（best-effort），且不 unlink', async () => {
        mockExists.mockReset();
        mockExists.mockRejectedValue(new Error('stat boom'));
        await expect(
            removeArtwork(`file://${ART_DIR}/x.jpg`),
        ).resolves.toBeUndefined();
        expect(mockUnlink).not.toHaveBeenCalled();
    });
});
