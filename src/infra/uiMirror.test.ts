import { atom } from 'jotai';

import { atomStore } from '@/utils/atomStore';

import { publishToUi, readLatest } from './uiMirror';

let mockAppState: string | null = 'active';
let mockChangeListener: ((state: string) => void) | undefined;

jest.mock('react-native', () => ({
    AppState: {
        get currentState() {
            return mockAppState;
        },
        addEventListener: jest.fn((_event: string, cb: (s: string) => void) => {
            mockChangeListener = cb;
            return { remove: jest.fn() };
        }),
    },
}));

function background(): void {
    mockAppState = 'background';
}

function foreground(): void {
    mockAppState = 'active';
    mockChangeListener?.('active');
}

beforeEach(() => {
    mockAppState = 'active';
});

describe('前台', () => {
    it('直接写入 atom', () => {
        const target = atom(0);
        publishToUi(target, 7);

        expect(atomStore.get(target)).toBe(7);
    });

    it('原生尚未上报状态时按前台处理', () => {
        // currentState 冷启动时是 null；判成后台就会缓冲，而那时并不会有 change
        // 事件到来，刷入时机永不到达，界面停在初值上
        mockAppState = null;
        const target = atom(0);
        publishToUi(target, 3);

        expect(atomStore.get(target)).toBe(3);
    });
});

describe('后台', () => {
    it('不写 atom，屏幕停在旧值', () => {
        const target = atom(0);
        background();
        publishToUi(target, 9);

        expect(atomStore.get(target)).toBe(0);
    });

    it('同一 atom 反复发布只留最新，冗余在入队前被吸收', () => {
        const target = atom(0);
        background();
        for (let tick = 1; tick <= 1000; tick += 1) {
            publishToUi(target, tick);
        }

        expect(atomStore.get(target)).toBe(0);

        // 一千次发布，回前台只兑现成一次写入
        const writes: number[] = [];
        const unsub = atomStore.sub(target, () =>
            writes.push(atomStore.get(target)),
        );
        foreground();
        unsub();

        expect(writes).toEqual([1000]);
    });

    it('读到的是暂存值，程序读不落后于真实状态', () => {
        const target = atom(0);
        background();
        publishToUi(target, 42);

        expect(readLatest(target)).toBe(42);
        expect(atomStore.get(target)).toBe(0);
    });

    it('读改写能连写多个键——从 atom 读会拿到过期底表，只剩最后一个', () => {
        const target = atom<ReadonlyMap<string, number>>(new Map());
        background();
        for (const key of ['a', 'b', 'c']) {
            const next = new Map(readLatest(target));
            next.set(key, 1);
            publishToUi(target, next);
        }
        foreground();

        expect([...atomStore.get(target).keys()]).toEqual(['a', 'b', 'c']);
    });

    it('回前台后多个 atom 各自刷入一次', () => {
        const first = atom(0);
        const second = atom(0);
        background();
        publishToUi(first, 1);
        publishToUi(second, 2);
        foreground();

        expect(atomStore.get(first)).toBe(1);
        expect(atomStore.get(second)).toBe(2);
    });
});

describe('前后台交界', () => {
    it('直写会清掉自己那一格，不会被随后的刷入用旧值盖回去', () => {
        // currentState 先翻回 active、change 事件后到；这个窗口里的直写若不清暂存，
        // 随后的 flush 会把旧值写回去
        const target = atom(0);
        background();
        publishToUi(target, 1);
        mockAppState = 'active';
        publishToUi(target, 2);
        mockChangeListener?.('active');

        expect(atomStore.get(target)).toBe(2);
    });

    it('刷入过的值不会在下一次回前台时被重新写回', () => {
        // 暂存必须是「消费掉」而不是「留着」：否则每次回前台都把上一轮的值再写一遍，
        // 覆盖掉这期间别处对该 atom 的改动，暂存表也只增不减
        const target = atom(0);
        background();
        publishToUi(target, 1);
        foreground();

        atomStore.set(target, 99);
        background();
        foreground();

        expect(atomStore.get(target)).toBe(99);
    });
});
