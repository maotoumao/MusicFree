/**
 * 存储根：内置存储必须恒在
 * 扫描侧的根恒含主存储，浏览侧要是缺了它，用户就会「扫得到却选不到」——两侧口径必须一致
 */
import { getStorageRoots } from './fileBrowser';

const mockGetMountedVolumes = jest.fn(
    (): Promise<unknown[]> => Promise.resolve([]),
);
jest.mock('@/infra/storageVolumes', () => ({
    PRIMARY_STORAGE_ROOT: '/storage/emulated/0',
    getMountedVolumes: () => mockGetMountedVolumes(),
}));
jest.mock('@dr.pogodin/react-native-fs', () => ({
    readDir: () => Promise.reject(new Error('not used here')),
}));

const SD = {
    path: '/storage/1A2B-3C4D',
    name: 'SD 卡',
    isPrimary: false,
    isRemovable: true,
    isMounted: true,
};
const INTERNAL = {
    path: '/storage/emulated/0',
    name: '内部共享存储空间',
    isPrimary: true,
    isRemovable: false,
    isMounted: true,
};

beforeEach(() => {
    jest.clearAllMocks();
    mockGetMountedVolumes.mockResolvedValue([]);
});

describe('getStorageRoots', () => {
    it('列出所有已挂载的卷，并带上卷身份供 UI 取名', async () => {
        mockGetMountedVolumes.mockResolvedValue([INTERNAL, SD]);

        expect(await getStorageRoots()).toEqual([
            {
                name: '内部共享存储空间',
                path: '/storage/emulated/0',
                volume: { isPrimary: true, isRemovable: false },
            },
            {
                name: 'SD 卡',
                path: '/storage/1A2B-3C4D',
                volume: { isPrimary: false, isRemovable: true },
            },
        ]);
    });

    it('系统只报了 SD 卡时补上内置存储入口', async () => {
        mockGetMountedVolumes.mockResolvedValue([SD]);

        const roots = await getStorageRoots();

        expect(roots.map(r => r.path)).toEqual([
            '/storage/emulated/0',
            '/storage/1A2B-3C4D',
        ]);
    });

    it('一个卷都拿不到时仍给出内置存储', async () => {
        mockGetMountedVolumes.mockResolvedValue([]);

        expect((await getStorageRoots()).map(r => r.path)).toEqual([
            '/storage/emulated/0',
        ]);
    });
});
