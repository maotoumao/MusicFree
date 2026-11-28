import { exists, readDir } from '@dr.pogodin/react-native-fs';

import { listMMKVIds } from './storage';

jest.mock('@dr.pogodin/react-native-fs', () => ({
    exists: jest.fn(),
    readDir: jest.fn(),
}));
jest.mock('react-native-mmkv', () => ({ createMMKV: jest.fn() }));
jest.mock('@/infra/paths', () => ({ basePath: '/test-private' }));

it('仅枚举有 crc 配对的数据文件，保留 id 本身的 crc 后缀', async () => {
    jest.mocked(exists).mockResolvedValue(true);
    jest.mocked(readDir).mockResolvedValue(
        [
            'MediaExtra.demo',
            'MediaExtra.demo.crc',
            'MediaExtra.ends.crc',
            'MediaExtra.ends.crc.crc',
            'orphan.crc',
        ].map(name => ({ name, isFile: () => true })) as Awaited<
            ReturnType<typeof readDir>
        >,
    );
    expect(await listMMKVIds()).toEqual([
        'MediaExtra.demo',
        'MediaExtra.ends.crc',
    ]);
});

it('从未创建的存储目录为空，读取权限失败则抛出', async () => {
    jest.mocked(exists).mockResolvedValue(false);
    expect(await listMMKVIds()).toEqual([]);
    jest.mocked(exists).mockResolvedValue(true);
    jest.mocked(readDir).mockRejectedValue(new Error('access denied'));
    await expect(listMMKVIds()).rejects.toThrow('access denied');
});
