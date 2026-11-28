/**
 * 已下载库镜像的时效性
 *
 * 镜像**同步**跟随 MMKV，只有发给 React 的那份才合批延迟。
 * 若镜像本身也延迟，「文件已删除」广播到达时就可能看不见刚写入的记录，
 * 于是漏摘一条——而消灭悬空记录正是这条链路存在的理由
 */
import { getDefaultStore } from 'jotai';

import {
    downloadedAtom,
    getDownloadedEntries,
    openDownloadedStore,
    removeDownloaded,
    writeDownloaded,
} from './store';

import type { DownloadedEntry } from './types';
import type { MusicItem } from '@/types';

/** 内存版 MMKV：只实现本模块用到的那几个口，并如实同步触发监听 */
const cells = new Map<string, string>();
const listeners = new Set<(key: string) => void>();

function write(key: string, value: string | undefined): void {
    if (value === undefined) cells.delete(key);
    else cells.set(key, value);
    listeners.forEach(cb => cb(key));
}

jest.mock('@/infra/storage', () => ({
    getOrCreateMMKV: () => mockStore(),
    getObject: (_s: unknown, key: string) => {
        const raw = mockCells().get(key);
        return raw === undefined ? undefined : JSON.parse(raw);
    },
    setObject: (_s: unknown, key: string, value: unknown) => {
        mockWrite(key, value === undefined ? undefined : JSON.stringify(value));
        return true;
    },
    getStoreVersion: () => 1,
    setStoreVersion: () => undefined,
}));

// jest.mock 工厂被提升到变量初始化之前，故一律经函数惰性取
const mockCells = () => cells;
const mockWrite = write;
const mockStore = () => ({
    getAllKeys: () => [...cells.keys()],
    addOnValueChangedListener: (cb: (key: string) => void) => {
        listeners.add(cb);
        return { remove: () => listeners.delete(cb) };
    },
});

const item = { platform: 'demo', id: 'song-1', title: 't' } as MusicItem;

const entryOf = (id: string): DownloadedEntry => ({
    item: { ...item, id } as MusicItem,
    mediaKey: JSON.stringify(['demo', id]),
    file: {
        path: `/dl/${id}.mp3`,
        extension: 'mp3',
        sizeBytes: 10,
        completedAt: 1000,
        resolvedQuality: 'high',
    },
});

/**
 * 每条用例用各自的 id：live 是模块级状态、跨用例不重置，
 * 而这正是生产里的样子（进程级单例），不该为测试开后门
 */
describe('镜像时效', () => {
    // 先建好镜像与监听，后续写入才走监听路径而非 hydrate 的全量读
    beforeAll(() => {
        getDownloadedEntries();
    });

    it('写入后立刻可反查，不必等微任务', () => {
        const store = openDownloadedStore();
        expect(store).not.toBeNull();
        const entry = entryOf('sync-write');

        writeDownloaded(store!, entry);

        // 同一个同步块内就要看得见——广播到达时不会有人替我们 await
        expect(getDownloadedEntries().get(entry.mediaKey)).toEqual(entry);
    });

    it('删除后立刻从镜像消失', () => {
        const store = openDownloadedStore()!;
        const entry = entryOf('sync-remove');
        writeDownloaded(store, entry);

        removeDownloaded(store, entry.mediaKey);

        expect(getDownloadedEntries().has(entry.mediaKey)).toBe(false);
    });

    it('发给 React 的那份合批到微任务后才更新', async () => {
        const store = openDownloadedStore()!;
        const jotai = getDefaultStore();
        const entry = entryOf('batched');

        writeDownloaded(store, entry);

        expect(jotai.get(downloadedAtom).has(entry.mediaKey)).toBe(false);
        await Promise.resolve();
        expect(jotai.get(downloadedAtom).get(entry.mediaKey)).toEqual(entry);
    });

    it('一 tick 内写多条只发布一次', async () => {
        const store = openDownloadedStore()!;
        const jotai = getDefaultStore();
        let published = 0;
        const unsub = jotai.sub(downloadedAtom, () => published++);

        writeDownloaded(store, entryOf('batch-a'));
        writeDownloaded(store, entryOf('batch-b'));
        writeDownloaded(store, entryOf('batch-c'));
        await Promise.resolve();
        unsub();

        expect(published).toBe(1);
        expect(getDownloadedEntries().has(entryOf('batch-c').mediaKey)).toBe(
            true,
        );
    });
});
