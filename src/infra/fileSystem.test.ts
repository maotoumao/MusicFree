import { Buffer } from 'buffer';

import { read } from '@dr.pogodin/react-native-fs';

import { readUtf8File } from './fileSystem';

jest.mock('@dr.pogodin/react-native-fs', () => ({
    read: jest.fn(),
    mkdir: jest.fn(),
    unlink: jest.fn(),
    writeFile: jest.fn(),
}));

const mockRead = jest.mocked(read);
const chunkBytes = 256 * 1024;

function useFile(text: string, shortRead?: number): number {
    const bytes = Buffer.from(text, 'utf8');
    mockRead.mockImplementation(async (_path, length = 0, position = 0) =>
        bytes
            .subarray(
                position,
                position + Math.min(length, shortRead ?? length),
            )
            .toString('latin1'),
    );
    return bytes.length;
}

beforeEach(() => jest.resetAllMocks());

describe('readUtf8File', () => {
    it('空文件不调用原生读取', async () => {
        await expect(readUtf8File('/empty', 0)).resolves.toBe('');
        expect(mockRead).not.toHaveBeenCalled();
    });

    it.each([1, 2, 3])('跨块四字节字符保留 %i 个尾字节', async tailBytes => {
        const text = 'a'.repeat(chunkBytes - tailBytes) + '\u{1f3b5}结束';
        const size = useFile(text);
        await expect(readUtf8File('/unicode', size)).resolves.toBe(text);
        expect(mockRead).toHaveBeenNthCalledWith(
            1,
            '/unicode',
            chunkBytes,
            0,
            'ascii',
        );
        expect(mockRead).toHaveBeenNthCalledWith(
            2,
            '/unicode',
            size - chunkBytes,
            chunkBytes,
            'ascii',
        );
    });

    it.each([1, 2])('中文跨块保留 %i 个尾字节', async tailBytes => {
        const text = 'a'.repeat(chunkBytes - tailBytes) + '测试';
        await expect(readUtf8File('/unicode', useFile(text))).resolves.toBe(
            text,
        );
    });

    it('短读按实际字节数推进，UTF-8 可跨多个短读', async () => {
        const text = '\ufeff测试\u{1f3b5}é';
        await expect(readUtf8File('/short', useFile(text, 1))).resolves.toBe(
            text,
        );
    });

    it('文件提前结束时拒绝，不继续读取越界', async () => {
        mockRead.mockResolvedValueOnce('abc').mockResolvedValueOnce('');
        await expect(readUtf8File('/short', 10)).rejects.toThrow(
            'File length changed',
        );
        expect(mockRead).toHaveBeenCalledTimes(2);
    });

    it('残缺 UTF-8 拒绝，不静默损坏文本', async () => {
        mockRead.mockResolvedValue('\xe4\xb8');
        await expect(readUtf8File('/invalid', 2)).rejects.toThrow();
    });

    it.each([-1, Number.NaN, 1.5])('非法字节数 %p 不发起读取', async size => {
        await expect(readUtf8File('/invalid', size)).rejects.toThrow(
            'Invalid file size',
        );
        expect(mockRead).not.toHaveBeenCalled();
    });

    it('原生读取错误保持原样', async () => {
        const error = new Error('storage unavailable');
        mockRead.mockRejectedValue(error);
        await expect(readUtf8File('/missing', 1)).rejects.toBe(error);
    });
});
