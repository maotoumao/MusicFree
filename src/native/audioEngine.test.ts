const mockSetup = jest.fn(async (_options: unknown) => undefined);
const mockAckProgress = jest.fn((_deliveryId: number) => undefined);

interface MockProgressRuntime {
    __mockAudioProgressCalls?: number;
    __mockAudioProgressListener?: (event: {
        deliveryId: number;
        position: number;
        duration: number;
        buffered: number;
        slotId: number;
    }) => void;
}

jest.mock('./specs/NativeAudioEngine', () => ({
    __esModule: true,
    default: {
        setup: (options: unknown) => mockSetup(options),
        ackProgress: (deliveryId: number) => mockAckProgress(deliveryId),
        onProgress: (
            listener: NonNullable<
                MockProgressRuntime['__mockAudioProgressListener']
            >,
        ) => {
            const runtime = globalThis as MockProgressRuntime;
            runtime.__mockAudioProgressCalls =
                (runtime.__mockAudioProgressCalls ?? 0) + 1;
            runtime.__mockAudioProgressListener = listener;
            return { remove: jest.fn() };
        },
    },
}));

import { audioEngine } from './audioEngine';

describe('audioEngine setup', () => {
    beforeEach(() => {
        mockSetup.mockClear();
    });

    it('partial 参数与桥层默认值合并后再传给原生', async () => {
        await audioEngine.setup({ cacheEnabled: true });

        expect(mockSetup).toHaveBeenCalledWith({
            cacheEnabled: true,
            maxCacheBytes: 512 * 1024 * 1024,
            progressIntervalMs: 500,
            mixWithOthers: false,
        });
    });
});

describe('audioEngine progress ack', () => {
    let unsubscribes: Array<() => void> = [];

    beforeEach(() => {
        mockAckProgress.mockClear();
    });

    afterEach(() => {
        unsubscribes.forEach(unsubscribe => unsubscribe());
        unsubscribes = [];
    });

    const emitProgress = () => {
        const listener = (globalThis as MockProgressRuntime)
            .__mockAudioProgressListener;
        if (!listener) {
            throw new Error('onProgress 未注册');
        }
        listener({
            deliveryId: 7,
            position: 12,
            duration: 180,
            buffered: 24,
            slotId: 3,
        });
    };

    it('同步消费完成后立即 ack', () => {
        const consume = jest.fn();
        unsubscribes.push(audioEngine.onProgress(consume));

        emitProgress();

        expect(consume).toHaveBeenCalledWith(
            { position: 12, duration: 180, buffered: 24 },
            3,
        );
        expect(mockAckProgress).toHaveBeenCalledWith(7);
    });

    it('异步消费完成前不 ack，完成后才 ack', async () => {
        let finish!: () => void;
        const consumed = new Promise<void>(resolve => {
            finish = resolve;
        });
        unsubscribes.push(audioEngine.onProgress(() => consumed));

        emitProgress();
        expect(mockAckProgress).not.toHaveBeenCalled();

        finish();
        await new Promise(resolve => setImmediate(resolve));
        expect(mockAckProgress).toHaveBeenCalledWith(7);
    });

    it('异步消费失败也 ack，避免发送窗口永久堵塞', async () => {
        const consumed = Promise.reject(new Error('consume failed'));
        unsubscribes.push(audioEngine.onProgress(() => consumed));

        emitProgress();
        await new Promise(resolve => setImmediate(resolve));

        expect(mockAckProgress).toHaveBeenCalledWith(7);
    });

    it('同步观察者不能绕过未完成的异步消费者提前 ack', async () => {
        let finish!: () => void;
        const consumed = new Promise<void>(resolve => {
            finish = resolve;
        });
        const observe = jest.fn();
        unsubscribes.push(
            audioEngine.onProgress(() => consumed),
            audioEngine.onProgress(observe),
        );

        emitProgress();

        expect(observe).toHaveBeenCalled();
        expect(mockAckProgress).not.toHaveBeenCalled();

        finish();
        await new Promise(resolve => setImmediate(resolve));
        expect(mockAckProgress).toHaveBeenCalledTimes(1);
        expect(mockAckProgress).toHaveBeenCalledWith(7);
    });

    it('退订后可重新注册，重复退订不影响新消费者', () => {
        const first = jest.fn();
        const unsubscribeFirst = audioEngine.onProgress(first);
        unsubscribeFirst();

        const second = jest.fn();
        unsubscribes.push(audioEngine.onProgress(second));
        unsubscribeFirst();

        emitProgress();

        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalled();
        expect(mockAckProgress).toHaveBeenCalledTimes(1);
    });

    it('模块重载复用 runtime 内的同一条原生订阅', () => {
        expect(
            (globalThis as MockProgressRuntime).__mockAudioProgressCalls,
        ).toBe(1);

        jest.isolateModules(() => {
            require('./audioEngine');
        });

        expect(
            (globalThis as MockProgressRuntime).__mockAudioProgressCalls,
        ).toBe(1);
    });
});
