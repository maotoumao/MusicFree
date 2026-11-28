import { QueryClient } from '@tanstack/react-query';

import {
    clearExpoImageCache,
    clearStreamingCacheAndUpdate,
} from './cacheActions';

const mockClearStreamingCache = jest.fn<Promise<number>, []>();
const mockClearMemoryCache = jest.fn<Promise<boolean>, []>();
const mockClearDiskCache = jest.fn<Promise<boolean>, []>();

jest.mock('@/core/player', () => ({
    player: {
        clearStreamingCache: () => mockClearStreamingCache(),
    },
}));

jest.mock('expo-image', () => ({
    Image: {
        clearMemoryCache: () => mockClearMemoryCache(),
        clearDiskCache: () => mockClearDiskCache(),
    },
}));

const queryKey = ['settings', 'streamingCacheSize'] as const;

beforeEach(() => {
    jest.clearAllMocks();
    mockClearStreamingCache.mockResolvedValue(0);
    mockClearMemoryCache.mockResolvedValue(true);
    mockClearDiskCache.mockResolvedValue(true);
});

describe('clearStreamingCacheAndUpdate', () => {
    it('取消旧查询后写入清理后的真实剩余量，迟到结果不能覆盖', async () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        let resolveOld = (_value: number) => undefined as void;
        const oldFetch = queryClient
            .fetchQuery({
                queryKey,
                queryFn: () =>
                    new Promise<number>(resolve => {
                        resolveOld = resolve;
                    }),
            })
            .catch(() => undefined);
        mockClearStreamingCache.mockResolvedValue(4096);

        await clearStreamingCacheAndUpdate(queryClient);
        resolveOld(9999);
        await oldFetch;

        expect(queryClient.getQueryData(queryKey)).toBe(4096);
        queryClient.clear();
    });
});

describe('clearExpoImageCache', () => {
    it('内存或磁盘任一返回 false 时失败', async () => {
        mockClearDiskCache.mockResolvedValue(false);

        await expect(clearExpoImageCache()).rejects.toThrow();
    });

    it('一项提前 reject 时仍等待另一项结束后再失败', async () => {
        let finishDisk = (_value: boolean) => undefined as void;
        mockClearMemoryCache.mockRejectedValue(new Error('memory failed'));
        mockClearDiskCache.mockImplementation(
            () =>
                new Promise<boolean>(resolve => {
                    finishDisk = resolve;
                }),
        );
        let settled = false;
        const pending = clearExpoImageCache();
        const observed = pending.then(
            () => true,
            () => false,
        );
        observed.then(() => {
            settled = true;
        });

        await new Promise<void>(resolve => setImmediate(resolve));
        expect(settled).toBe(false);

        finishDisk(true);
        await expect(observed).resolves.toBe(false);
    });
});
