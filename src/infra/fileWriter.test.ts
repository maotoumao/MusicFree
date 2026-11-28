import { appendFile, stat, writeFile } from '@dr.pogodin/react-native-fs';

import { createTextFileWriter } from './fileWriter';

jest.mock('@dr.pogodin/react-native-fs', () => ({
    appendFile: jest.fn(),
    stat: jest.fn(),
    writeFile: jest.fn(),
}));

const mockAppendFile = jest.mocked(appendFile);
const mockStat = jest.mocked(stat);
const mockWriteFile = jest.mocked(writeFile);

/** 按真实调用顺序维护的虚拟文件：writeFile 覆盖、appendFile 追加 */
let file: string | undefined;

/** 落盘次数（两种调用合计） */
function flushCount(): number {
    return mockWriteFile.mock.calls.length + mockAppendFile.mock.calls.length;
}

beforeEach(() => {
    jest.clearAllMocks();
    file = undefined;
    mockWriteFile.mockImplementation((_path, content) => {
        file = content;
        return Promise.resolve();
    });
    mockAppendFile.mockImplementation((_path, content) => {
        file = (file ?? '') + content;
        return Promise.resolve();
    });
    mockStat.mockImplementation(() =>
        Promise.resolve({ size: (file ?? '').length } as Awaited<
            ReturnType<typeof stat>
        >),
    );
});

describe('增量写文本文件', () => {
    it('未攒够阈值前不落盘', async () => {
        const writer = createTextFileWriter('/tmp/a.json');

        await writer.write('小片');
        await writer.write('又一片');

        expect(flushCount()).toBe(0);
    });

    it('close 冲刷余料，首次落盘用 writeFile 以截断旧内容', async () => {
        const writer = createTextFileWriter('/tmp/a.json');

        await writer.write('内容');
        await writer.close();

        expect(mockWriteFile).toHaveBeenCalledWith(
            '/tmp/a.json',
            '内容',
            'utf8',
        );
        expect(mockAppendFile).not.toHaveBeenCalled();
        expect(file).toBe('内容');
    });

    it('首次之后改用 appendFile，内容按序拼接不丢不乱', async () => {
        const writer = createTextFileWriter('/tmp/a.json');
        const big = 'x'.repeat(64 * 1024);

        await writer.write(big);
        await writer.write('尾巴');
        await writer.close();

        expect(mockWriteFile).toHaveBeenCalledTimes(1);
        expect(mockAppendFile).toHaveBeenCalledTimes(1);
        expect(file).toBe(`${big}尾巴`);
    });

    it('大量小片被合并成极少数次落盘', async () => {
        const writer = createTextFileWriter('/tmp/a.json');
        const pieces = Array.from({ length: 20_000 }, (_, i) => `{"id":${i}},`);

        for (const piece of pieces) {
            await writer.write(piece);
        }
        await writer.close();

        expect(flushCount()).toBeLessThan(20);
        expect(file).toBe(pieces.join(''));
    });

    it('一片都没写过也产出空文件', async () => {
        const writer = createTextFileWriter('/tmp/a.json');

        await writer.close();

        expect(mockWriteFile).toHaveBeenCalledWith('/tmp/a.json', '', 'utf8');
        expect(file).toBe('');
    });

    it('代理对恰好跨批次时不被拆坏', async () => {
        const writer = createTextFileWriter('/tmp/a.json');
        // 首片末尾正好停在高代理项上，且凑满阈值触发落盘
        const head = 'a'.repeat(64 * 1024 - 1);

        await writer.write(`${head}\uD83D`);
        await writer.write('\uDE00尾');
        await writer.close();

        expect(file).toBe(`${head}\uD83D\uDE00尾`);
        // 高代理项被留到下一批，不会单独落盘
        expect(mockWriteFile).toHaveBeenCalledWith('/tmp/a.json', head, 'utf8');
    });

    it('close 返回 stat 报告的字节数', async () => {
        mockStat.mockResolvedValue({ size: 1234 } as Awaited<
            ReturnType<typeof stat>
        >);
        const writer = createTextFileWriter('/tmp/a.json');

        await writer.write('内容');

        await expect(writer.close()).resolves.toBe(1234);
        expect(mockStat).toHaveBeenCalledWith('/tmp/a.json');
    });

    it('close 幂等：重复调用返回同一结果且不重复落盘', async () => {
        const writer = createTextFileWriter('/tmp/a.json');

        await writer.write('内容');
        const first = await writer.close();

        await expect(writer.close()).resolves.toBe(first);
        expect(flushCount()).toBe(1);
        expect(mockStat).toHaveBeenCalledTimes(1);
    });
});

describe('写入失败后作废整个写入器', () => {
    it('首次落盘失败后 close 重抛原错，不会退化成写出空文件', async () => {
        mockWriteFile.mockRejectedValue(new Error('磁盘已满'));
        const writer = createTextFileWriter('/tmp/a.json');
        const big = 'x'.repeat(64 * 1024);

        await expect(writer.write(big)).rejects.toThrow('磁盘已满');

        await expect(writer.close()).rejects.toThrow('磁盘已满');
        expect(file).toBeUndefined();
    });

    it('追加失败后续调用一律重抛，不再尝试落盘', async () => {
        mockAppendFile.mockRejectedValue(new Error('设备已拔出'));
        const writer = createTextFileWriter('/tmp/a.json');
        const big = 'x'.repeat(64 * 1024);

        await writer.write(big);
        await expect(writer.write(big)).rejects.toThrow('设备已拔出');

        await expect(writer.write('再来')).rejects.toThrow('设备已拔出');
        await expect(writer.close()).rejects.toThrow('设备已拔出');
        expect(mockAppendFile).toHaveBeenCalledTimes(1);
    });

    it('关闭后不能继续写入', async () => {
        const writer = createTextFileWriter('/tmp/a.json');

        await writer.write('内容');
        await writer.close();

        await expect(writer.write('越界')).rejects.toThrow('已关闭');
        expect(file).toBe('内容');
    });
});
