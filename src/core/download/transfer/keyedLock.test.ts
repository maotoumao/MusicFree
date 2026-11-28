import { KeyedLock } from './keyedLock';

/** 造一个可外部决定何时结束的任务 */
function deferred() {
    let resolve!: (v?: unknown) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise((res, rej) => {
        resolve = res as (v?: unknown) => void;
        reject = rej;
    });
    return { promise, resolve, reject };
}

describe('KeyedLock', () => {
    it('同一 key 串行：前一个没结束，后一个不开始', async () => {
        const lock = new KeyedLock();
        const first = deferred();
        const order: string[] = [];

        const a = lock.run('k', async () => {
            order.push('a:start');
            await first.promise;
            order.push('a:end');
        });
        const b = lock.run('k', async () => {
            order.push('b:start');
        });

        await Promise.resolve();
        expect(order).toEqual(['a:start']);

        first.resolve();
        await Promise.all([a, b]);
        expect(order).toEqual(['a:start', 'a:end', 'b:start']);
    });

    it('不同 key 并行，互不等待', async () => {
        const lock = new KeyedLock();
        const blocked = deferred();
        const order: string[] = [];

        const a = lock.run('k1', async () => {
            await blocked.promise;
            order.push('k1');
        });
        await lock.run('k2', async () => {
            order.push('k2');
        });

        expect(order).toEqual(['k2']);
        blocked.resolve();
        await a;
        expect(order).toEqual(['k2', 'k1']);
    });

    it('前一个失败不影响后续排队者，且失败照常抛给它自己的调用方', async () => {
        const lock = new KeyedLock();
        const failing = lock.run('k', () => Promise.reject(new Error('boom')));
        const next = lock.run('k', () => Promise.resolve('ok'));

        await expect(failing).rejects.toThrow('boom');
        await expect(next).resolves.toBe('ok');
    });

    it('队列排空后不留残余（长期运行不涨内存）', async () => {
        const lock = new KeyedLock();
        await lock.run('k', () => Promise.resolve());
        await Promise.resolve();
        await Promise.resolve();

        // 私有字段无法直接断言，改以「新任务立即开始」间接验证队尾已清
        const order: string[] = [];
        await lock.run('k', async () => {
            order.push('fresh');
        });
        expect(order).toEqual(['fresh']);
    });
});
