jest.mock('@/native/specs/NativeTimer', () => {
    const handles = new Map<number, ReturnType<typeof setTimeout>>();
    let listener: ((event: { id: number }) => void) | undefined;
    return {
        __esModule: true,
        default: {
            onTimerFire: (callback: (event: { id: number }) => void) => {
                listener = callback;
            },
            setTimeout: (id: number, ms: number) => {
                handles.set(
                    id,
                    setTimeout(() => {
                        handles.delete(id);
                        listener?.({ id });
                    }, ms),
                );
            },
            clearTimeout: (id: number) => {
                const handle = handles.get(id);
                if (handle !== undefined) {
                    clearTimeout(handle);
                    handles.delete(id);
                }
            },
        },
    };
});

import { withTimeout, TimeoutError } from './timer';

describe('withTimeout', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('原 Promise 先完成时返回其结果并撤掉计时器', async () => {
        await expect(withTimeout(Promise.resolve('done'), 1000)).resolves.toBe(
            'done',
        );
        expect(jest.getTimerCount()).toBe(0);
    });

    it('到达时限时以 timeout 错误拒绝', async () => {
        const pending = withTimeout(new Promise<void>(() => {}), 1000);
        const settled = pending.catch(error => error);

        await jest.advanceTimersByTimeAsync(1000);

        await expect(settled).resolves.toEqual(expect.any(TimeoutError));
    });
});
