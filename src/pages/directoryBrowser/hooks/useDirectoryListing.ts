import { useQuery } from '@tanstack/react-query';

import { getStorageRoots, listDirectories } from '@/infra/fileBrowser';

import type { DirEntry } from '@/infra/fileBrowser';

/**
 * 目录浏览列表：path 为空读存储根（常用位置），否则读该目录的子文件夹
 * 子目录按 path 缓存——返回上级即时命中不重取；目录结构变动少，给较长 staleTime
 * 存储根不吃这份缓存：SD 卡随时可插拔，进页面就得看到当下真实的卷
 */
export function useDirectoryListing(path: string | undefined) {
    const isRoots = path === undefined;
    return useQuery<readonly DirEntry[]>({
        queryKey: ['localDirectories', path ?? ''],
        queryFn: () => (isRoots ? getStorageRoots() : listDirectories(path)),
        staleTime: isRoots ? 0 : 5 * 60 * 1000,
        refetchOnMount: isRoots ? 'always' : true,
    });
}
