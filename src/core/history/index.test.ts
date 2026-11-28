/**
 * 播放历史的上限订阅
 *
 * `#cap` 只在 add / remove / replace 时跑，所以「用户把上限调小」这件事本身不会
 * 让已存的记录变短——列表要等下次播歌才收敛。这里覆盖订阅补上的那一步
 */
import { getHistory, setHistory } from './store';
import { HISTORY_KEY } from './types';

import { History } from '.';

import type { ConfigKey, IConfig } from '@/core/config';
import type { MusicItem } from '@/types';

/** 内存版 MMKV：只实现本模块用到的那几个口 */
const cells = new Map<string, unknown>();
const setObjectSpy = jest.fn((key: string, value: unknown) => {
    cells.set(key, value);
    return true;
});

jest.mock('@/infra/storage', () => ({
    getOrCreateMMKV: () => ({}),
    getObject: (_s: unknown, key: string) => mockCells().get(key),
    setObject: (_s: unknown, key: string, value: unknown) =>
        mockSetObject(key, value),
}));

// jest.mock 工厂被提升到变量初始化之前，故经函数惰性取
const mockCells = () => cells;
const mockSetObject = (key: string, value: unknown) => setObjectSpy(key, value);

/** 假 config：逐 key 存值，set 时同步派发订阅（对齐 MMKV 的同步回调） */
function createConfig(maxHistoryLen?: unknown) {
    const values = new Map<ConfigKey, unknown>([
        ['basic.maxHistoryLen', maxHistoryLen],
    ]);
    const subs = new Set<{ keys: readonly ConfigKey[]; cb: () => void }>();
    return {
        get: (key: ConfigKey) => values.get(key),
        getStored: (key: ConfigKey) => values.get(key),
        isValid: () => true,
        set: (key: ConfigKey, next: unknown) => {
            values.set(key, next);
            subs.forEach(s => {
                if (s.keys.includes(key)) s.cb();
            });
        },
        subscribe: (keys: readonly ConfigKey[], cb: () => void) => {
            const entry = { keys, cb };
            subs.add(entry);
            return () => subs.delete(entry);
        },
    } as unknown as IConfig & { set(key: ConfigKey, value: unknown): void };
}

const songs = (count: number): MusicItem[] =>
    Array.from(
        { length: count },
        (_, i) =>
            ({ platform: 'demo', id: `s${i}`, title: `t${i}` } as MusicItem),
    );

beforeEach(() => {
    cells.clear();
    setObjectSpy.mockClear();
    setHistory([]);
});

describe('History 的上限订阅', () => {
    it('上限调小后立即裁剪并写盘', () => {
        const config = createConfig(50);
        const history = new History({ config });
        history.replace(songs(30));
        expect(getHistory()).toHaveLength(30);

        config.set('basic.maxHistoryLen', 10);

        expect(getHistory()).toHaveLength(10);
        // 裁剪保留最新的（newest-first）
        expect(getHistory()[0]?.id).toBe('s0');
        expect(getHistory()[9]?.id).toBe('s9');
        expect(cells.get(HISTORY_KEY)).toHaveLength(10);
    });

    it('上限调大既不重发也不写盘', () => {
        const config = createConfig(10);
        const history = new History({ config });
        history.replace(songs(30)); // 写入时已按 10 截断
        const before = getHistory();
        const writesBefore = setObjectSpy.mock.calls.length;

        config.set('basic.maxHistoryLen', 100);

        // 同一引用：没有重新发布，React 侧不会因此重渲染
        expect(getHistory()).toBe(before);
        expect(getHistory()).toHaveLength(10);
        expect(setObjectSpy).toHaveBeenCalledTimes(writesBefore);
    });

    it.each([
        ['零', 0],
        ['负数', -1],
        ['小数', 1.5],
        ['NaN', Number.NaN],
        ['非 number', '100'],
        ['未设置', undefined],
    ])('上限为%s时回落兜底 50', (_label, invalid) => {
        const config = createConfig(200);
        const history = new History({ config });
        history.replace(songs(120));
        expect(getHistory()).toHaveLength(120);

        config.set('basic.maxHistoryLen', invalid);

        expect(getHistory()).toHaveLength(50);
    });

    it('其它 key 变更不触发裁剪', () => {
        const config = createConfig(20);
        const history = new History({ config });
        history.replace(songs(20));
        const before = getHistory();
        const writesBefore = setObjectSpy.mock.calls.length;

        // 上限本身不变；若错误地对所有 key 都跑一遍裁剪，这里读到的仍是 20，
        // 故额外断言「没有发生写盘」来暴露多余的 commit
        config.set('basic.autoPlayWhenAppStart', true);

        expect(getHistory()).toBe(before);
        expect(setObjectSpy).toHaveBeenCalledTimes(writesBefore);
    });

    it('盘上的超量记录在 hydrate 时就被裁掉并回写', () => {
        cells.set(HISTORY_KEY, songs(200));
        const config = createConfig(20);
        new History({ config });

        // 只发 atom 不回写的话，盘上会一直留着 200 条
        expect(getHistory()).toHaveLength(20);
        expect(cells.get(HISTORY_KEY)).toHaveLength(20);

        // 之后把上限调大再重启，不该把已裁掉的记录放回来
        config.set('basic.maxHistoryLen', 50);
        setHistory([]);
        new History({ config });
        expect(getHistory()).toHaveLength(20);
    });

    it('盘上记录未超量时 hydrate 不写盘', () => {
        cells.set(HISTORY_KEY, songs(10));
        const config = createConfig(50);

        new History({ config });

        expect(getHistory()).toHaveLength(10);
        expect(setObjectSpy).not.toHaveBeenCalled();
    });
});
