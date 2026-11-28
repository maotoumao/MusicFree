import { AuthType, createClient, parseXML } from 'webdav';

import { createWebdavStore, WebdavRequestError } from './webdav';

jest.mock('webdav', () => ({
    AuthType: { Auto: 'auto', Password: 'password', Digest: 'digest' },
    createClient: jest.fn(),
    parseXML: jest.fn((xml: string) => Promise.resolve(JSON.parse(xml))),
    parseStat: jest.fn(result => result),
}));

/**
 * 真实实现走 NativeTimer TurboModule，测试环境拿不到
 * 预算到点由用例自己触发（`fireTimer`），并保留 abort 语义——「请求先结算就撤掉计时器」要能被断言
 */
jest.mock('@/infra/timer', () => ({
    delay: (
        ms: number,
        opts?: { runInBackground?: boolean; signal?: AbortSignal },
    ) =>
        new Promise<void>((resolve, reject) => {
            const entry = { ms, fire: resolve };
            mockTimerBudgets.push({
                ms,
                runInBackground: opts?.runInBackground === true,
            });
            mockPendingTimers.push(entry);
            opts?.signal?.addEventListener(
                'abort',
                () => {
                    const at = mockPendingTimers.indexOf(entry);
                    if (at >= 0) {
                        mockPendingTimers.splice(at, 1);
                    }
                    reject(mockAbortError());
                },
                { once: true },
            );
        }),
}));

/** 还在等的计时器（结算 / 取消后会被移出） */
// jest 只允许 mock 工厂引用 mock 前缀的变量，故这几个辅助量都带前缀
const mockPendingTimers: { ms: number; fire: () => void }[] = [];

/** 一路要过的预算，按请求顺序；用来断言「预算是怎么算出来的、走的哪种计时器」 */
const mockTimerBudgets: { ms: number; runInBackground: boolean }[] = [];

/** 只看预算数值 */
function budgetMs(): number[] {
    return mockTimerBudgets.map(budget => budget.ms);
}

/** fetch 被 abort 后抛的就是这个：name 为 AbortError 的普通 Error */
function mockAbortError(): Error {
    const error = new Error('Aborted');
    error.name = 'AbortError';
    return error;
}

/** 让预算到点（并把它移出队列，便于断言没有残留计时器） */
function fireTimer(): void {
    const entry = mockPendingTimers.shift();
    if (!entry) {
        throw new Error('没有在等的计时器');
    }
    entry.fire();
}

/** 库给响应类错误挂 status（response.js 的 createErrorFromResponse） */
function notFound(): Error {
    return Object.assign(new Error('404 Not Found'), { status: 404 });
}

/** 模拟「TCP 连上但服务端不回包」：只有 abort 能让它结束 */
function hangUntilAbort(signal: AbortSignal): Promise<never> {
    return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(mockAbortError()), {
            once: true,
        });
    });
}

/** 取 promise 的失败结局：是 WebdavRequestError 就报它的 kind，否则原样返回 */
async function failureOf(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise;
        return 'resolved';
    } catch (error) {
        return error instanceof WebdavRequestError ? error.kind : error;
    }
}

const mockCreateClient = jest.mocked(createClient);

const client = {
    customRequest: jest.fn(),
    stat: jest.fn(),
    exists: jest.fn(),
    createDirectory: jest.fn(),
    getDirectoryContents: jest.fn(),
    getFileContents: jest.fn(),
    putFileContents: jest.fn(),
    moveFile: jest.fn(),
    deleteFile: jest.fn(),
};

const cred = { url: 'https://ex/dav', username: 'u', password: 'p' };

function makeStore(signal?: AbortSignal) {
    return createWebdavStore(cred, signal ? { signal } : undefined);
}

/** 每个请求都要带上一个真的 AbortSignal */
const withSignal = { signal: expect.any(AbortSignal) };

beforeEach(() => {
    jest.clearAllMocks();
    mockPendingTimers.length = 0;
    mockTimerBudgets.length = 0;
    mockCreateClient.mockReturnValue(client as never);
    client.stat.mockResolvedValue({ type: 'directory' });
    client.exists.mockResolvedValue(true);
    client.createDirectory.mockResolvedValue(undefined);
    client.getFileContents.mockResolvedValue('{}');
    client.putFileContents.mockResolvedValue(undefined);
    client.moveFile.mockResolvedValue(undefined);
    client.deleteFile.mockResolvedValue(undefined);
    client.customRequest.mockImplementation(async (path, options) => {
        const signalOptions = { signal: options.signal };
        let content = '';
        switch (options.method) {
            case 'PROPFIND':
                content = JSON.stringify(
                    await client.stat(path, signalOptions),
                );
                break;
            case 'MKCOL':
                await client.createDirectory(path, signalOptions);
                break;
            case 'GET':
                content = await client.getFileContents(path, {
                    format: 'text',
                    ...signalOptions,
                });
                break;
            case 'PUT':
                await client.putFileContents(path, options.data, {
                    overwrite: true,
                    contentLength: Number(options.headers['Content-Length']),
                    ...signalOptions,
                });
                break;
            case 'MOVE':
                await client.moveFile(
                    path,
                    decodeURIComponent(
                        options.headers.Destination.replace(
                            'https://ex/dav',
                            '',
                        ),
                    ),
                    signalOptions,
                );
                break;
            case 'DELETE':
                await client.deleteFile(path, signalOptions);
                break;
        }
        return {
            ok: true,
            status: options.method === 'PROPFIND' ? 207 : 200,
            text: async () => content,
        };
    });
});

describe('WebDAV 连接', () => {
    it.each(['PROPFIND', 'GET', 'PUT', 'MOVE', 'DELETE'])(
        'Digest 最终 %s 401 在解析或报告成功前被拒绝',
        async method => {
            const text = jest.fn(async () => 'private response');
            client.customRequest.mockResolvedValue({
                ok: false,
                status: 401,
                text,
            });
            const store = makeStore();
            const run =
                method === 'PROPFIND'
                    ? store.testConnection()
                    : method === 'GET'
                    ? store.readFile('/a', 100)
                    : method === 'PUT'
                    ? store.writeFile('/a', 'data', 4)
                    : method === 'MOVE'
                    ? store.moveFile('/a', '/b')
                    : store.remove('/a');
            await expect(run).rejects.toMatchObject({
                message: `WebDAV ${method}: HTTP 401`,
                status: 401,
            });
            expect(text).not.toHaveBeenCalled();
            expect(parseXML).not.toHaveBeenCalled();
        },
    );

    it('MKCOL 最终 401 不会伪装成创建成功', async () => {
        client.stat.mockRejectedValue(notFound());
        const original = client.customRequest.getMockImplementation()!;
        client.customRequest.mockImplementation((path, options) =>
            options.method === 'MKCOL'
                ? Promise.resolve({ ok: false, status: 401 })
                : original(path, options),
        );
        await expect(makeStore().ensureDir('/new')).rejects.toMatchObject({
            status: 401,
            message: 'WebDAV MKCOL: HTTP 401',
        });
    });

    it('MOVE 保留服务器基址子路径，编码目标且不携带 URL 凭据', async () => {
        const store = createWebdavStore({
            ...cred,
            url: 'https://user:password@ex/dav/space%20name/?token=private',
        });
        client.customRequest.mockResolvedValue({ ok: true, status: 204 });
        await store.moveFile('/a.part', '/MusicFree/name #1.json');
        expect(client.customRequest).toHaveBeenCalledWith('/a.part', {
            method: 'MOVE',
            headers: {
                Destination:
                    'https://ex/dav/space%20name/MusicFree/name%20%231.json',
                Overwrite: 'T',
            },
            ...withSignal,
        });
    });

    it('HTTP 错误只保留请求方法和状态，不带服务端原文或凭据', async () => {
        client.stat.mockRejectedValue(
            Object.assign(
                new Error('secret-response https://user:password@example.com'),
                { status: 401 },
            ),
        );
        await expect(makeStore().testConnection()).rejects.toMatchObject({
            message: 'WebDAV PROPFIND: HTTP 401',
            status: 401,
        });
    });
    it('向客户端传入 Auto 鉴权模式', () => {
        makeStore();

        expect(mockCreateClient).toHaveBeenCalledWith(
            'https://ex/dav',
            expect.objectContaining({
                authType: AuthType.Auto,
                username: 'u',
                password: 'p',
            }),
        );
    });

    it('连通性探测用 stat 而非拉取整个根目录', async () => {
        await makeStore().testConnection();

        expect(client.stat).toHaveBeenCalledWith('/', withSignal);
        expect(client.getDirectoryContents).not.toHaveBeenCalled();
    });

    it('探测失败向上抛', async () => {
        client.stat.mockRejectedValue(new Error('401 Unauthorized'));

        await expect(makeStore().testConnection()).rejects.toThrow('401');
    });
});

describe('确保目录存在', () => {
    it('自己逐级探再建，不把 recursive 交给库', async () => {
        // 库的 recursive 分支每级预检 stat 不透传 options，signal 丢在里面 → 那次请求不可取消
        client.stat.mockRejectedValue(notFound());

        await makeStore().ensureDir('/MusicFree');

        expect(client.stat).toHaveBeenCalledWith('/MusicFree', withSignal);
        expect(client.createDirectory).toHaveBeenCalledWith(
            '/MusicFree',
            withSignal,
        );
        const [, options] = client.createDirectory.mock.calls[0]!;
        expect(options).not.toHaveProperty('recursive');
    });

    it('已是目录就不建', async () => {
        client.stat.mockResolvedValue({ type: 'directory' });

        await makeStore().ensureDir('/MusicFree');

        expect(client.createDirectory).not.toHaveBeenCalled();
    });

    it('多级路径逐级走，从最外层开始', async () => {
        client.stat.mockRejectedValue(notFound());

        await makeStore().ensureDir('/a/b/c');

        expect(client.createDirectory.mock.calls.map(([path]) => path)).toEqual(
            ['/a', '/a/b', '/a/b/c'],
        );
    });

    it('创建失败但目标已是目录（并发建好）视为成功', async () => {
        client.stat
            .mockRejectedValueOnce(notFound())
            .mockResolvedValue({ type: 'directory' });
        client.createDirectory.mockRejectedValue(new Error('405'));

        await expect(
            makeStore().ensureDir('/MusicFree'),
        ).resolves.toBeUndefined();
    });

    it('目标是同名文件时报错，不去 MKCOL', async () => {
        client.stat.mockResolvedValue({ type: 'file' });

        await expect(makeStore().ensureDir('/MusicFree')).rejects.toThrow(
            '被同名文件占用',
        );
        expect(client.createDirectory).not.toHaveBeenCalled();
    });

    it('创建失败且复查也不是目录时抛回 MKCOL 的错误', async () => {
        // 两个 mock 的文案必须不同，否则断言分不出抛的是谁的错
        client.stat.mockRejectedValue(notFound());
        client.createDirectory.mockRejectedValue(new Error('mkcol denied'));

        await expect(makeStore().ensureDir('/MusicFree')).rejects.toThrow(
            'mkcol denied',
        );
    });

    it('预检报非 404 时原样抛出，不去 MKCOL：那是真故障，不是「不存在」', async () => {
        // 与库递归分支同判据（只有 404 才开始创建）；否则 503 会被吞掉、
        // 最后报出来的是那次注定失败的 MKCOL 的错，诊断时看到的不是病根
        const serverError = Object.assign(new Error('stat blew up'), {
            status: 503,
        });
        client.stat.mockRejectedValue(serverError);

        await expect(makeStore().ensureDir('/MusicFree')).rejects.toThrow(
            'WebDAV PROPFIND: HTTP 503',
        );
        expect(client.createDirectory).not.toHaveBeenCalled();
    });

    it('预检超时就此结束，不当成「不存在」接着去建', async () => {
        client.stat.mockImplementation(
            (_path: string, options: { signal: AbortSignal }) =>
                hangUntilAbort(options.signal),
        );

        const pending = makeStore().ensureDir('/MusicFree');
        fireTimer();

        expect(await failureOf(pending)).toBe('timeout');
        expect(client.createDirectory).not.toHaveBeenCalled();
    });

    it('MKCOL 超时不去复查：同一台不回包的服务器上再探一次只是白等一份预算', async () => {
        client.stat.mockRejectedValue(notFound());
        // 必须等 MKCOL 真发出去再让预算到点：在预检还没结算时就 fireTimer，
        // 烧掉的是预检那份预算，MKCOL 一次都发不出来，这条就退化成上面那条
        let mkcolIssued: () => void;
        const issued = new Promise<void>(resolve => {
            mkcolIssued = resolve;
        });
        client.createDirectory.mockImplementation(
            (_path: string, options: { signal: AbortSignal }) => {
                mkcolIssued();
                return hangUntilAbort(options.signal);
            },
        );

        const pending = makeStore().ensureDir('/MusicFree');
        await issued;
        expect(client.createDirectory).toHaveBeenCalledTimes(1);
        fireTimer();

        expect(await failureOf(pending)).toBe('timeout');
        // 只有预检那一次 stat，没有第二次复查
        expect(client.stat).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['/', '根目录不需要创建'],
        ['', '空路径同理'],
    ])('%p（%s）：一个请求都不发就成功', async path => {
        await expect(makeStore().ensureDir(path)).resolves.toBeUndefined();

        expect(client.stat).not.toHaveBeenCalled();
        expect(client.createDirectory).not.toHaveBeenCalled();
    });

    it.each([['/MusicFree/'], ['//MusicFree']])(
        '%p 归一到同一级，不会多建出一个 / 来',
        async path => {
            client.stat.mockRejectedValue(notFound());

            await makeStore().ensureDir(path);

            expect(
                client.createDirectory.mock.calls.map(([target]) => target),
            ).toEqual(['/MusicFree']);
        },
    );
});

describe('远端文件大小', () => {
    it('取文件字节数，供导入前的大小闸复用', async () => {
        client.stat.mockResolvedValue({ type: 'file', size: 2048 });

        await expect(
            makeStore().getFileSize('/MusicFree/MusicFreeBackup.json'),
        ).resolves.toBe(2048);
    });

    it('目标是目录时报错，不返回目录的 size', async () => {
        client.stat.mockResolvedValue({ type: 'directory', size: 0 });

        await expect(makeStore().getFileSize('/MusicFree')).rejects.toThrow(
            '不是文件',
        );
    });

    it('路径不存在时向上抛', async () => {
        client.stat.mockRejectedValue(notFound());

        await expect(makeStore().getFileSize('/nope.json')).rejects.toThrow(
            '404',
        );
    });
});

describe('远端文件读写', () => {
    it('按文本读取', async () => {
        client.getFileContents.mockResolvedValue('{"a":1}');

        await expect(makeStore().readFile('/a.json', 7)).resolves.toBe(
            '{"a":1}',
        );
        expect(client.getFileContents).toHaveBeenCalledWith('/a.json', {
            format: 'text',
            ...withSignal,
        });
    });

    it('写入覆盖已存在的远端文件', async () => {
        await makeStore().writeFile('/a.json', '{"a":1}', 7);

        // contentLength 给数字：库默认 true 会自己再扫一遍同一个字符串
        expect(client.putFileContents).toHaveBeenCalledWith(
            '/a.json',
            '{"a":1}',
            { overwrite: true, contentLength: 7, ...withSignal },
        );
    });

    it('移动文件用于就位发布', async () => {
        await makeStore().moveFile('/a.tmp', '/a.json');

        expect(client.moveFile).toHaveBeenCalledWith(
            '/a.tmp',
            '/a.json',
            withSignal,
        );
    });

    it('删除文件用于清理上传残留', async () => {
        await makeStore().remove('/a.part');

        expect(client.deleteFile).toHaveBeenCalledWith('/a.part', withSignal);
    });
});

describe('超时预算', () => {
    it('元数据请求一律 20s：只换几百字节，等更久没有意义', async () => {
        const store = makeStore();
        client.stat.mockImplementation(
            (_path: string, options: { signal: AbortSignal }) =>
                hangUntilAbort(options.signal),
        );

        const pending = store.testConnection();

        expect(budgetMs()).toEqual([20_000]);
        fireTimer();
        expect(await failureOf(pending)).toBe('timeout');
    });

    it('传输请求按正文大小加预算：固定余量 20s + 每 16 KiB 折 1s', async () => {
        const store = makeStore();

        // 读：预算按调用方给出的上界折算
        await store.readFile('/a.json', 8 * 1024 * 1024);
        // 写：预算按调用方给出的字节数折算
        await store.writeFile('/b.json', 'x', 800 * 1024);

        expect(budgetMs()).toEqual([
            20_000 + (8 * 1024 * 1024) / 16,
            20_000 + (800 * 1024) / 16,
        ]);
    });

    it('大小不可信时退化成固定余量，由调用方去换可信上界', async () => {
        const store = makeStore();

        // 库把缺失的 content-length 当 "0"，空值则 parseInt 出 NaN
        await store.readFile('/a.json', 0);
        await store.readFile('/b.json', Number.NaN);

        expect(budgetMs()).toEqual([20_000, 20_000]);
    });

    it('预算走后台可靠计时：JS setTimeout 在后台不走，几分钟的上传会等不到到点', async () => {
        const store = makeStore();

        await store.testConnection();
        await store.readFile('/a.json', 1024);

        // 逐项列全而不是 every：空数组上 every 恒真，预算整个被删掉也照绿
        expect(mockTimerBudgets).toEqual([
            { ms: 20_000, runInBackground: true },
            { ms: 20_000 + 64, runInBackground: true },
        ]);
    });

    it('库无视 signal 时预算照样让请求结算：光 abort 不足以解开上层的操作锁', async () => {
        // 不接 signal 的请求（webdav 递归建目录的预检 stat 就是这样）
        client.stat.mockImplementation(
            () => new Promise<never>(() => undefined),
        );

        const pending = makeStore().testConnection();
        fireTimer();

        expect(await failureOf(pending)).toBe('timeout');
    });

    it('请求正常结算后不留计时器：否则每次请求都攒下一个到点才醒的原生 timer', async () => {
        const store = makeStore();

        await store.testConnection();
        await store.readFile('/a.json', 1024);

        // 先确认确实建过两个，再确认都撤了——不然「从没建过」也是 0
        expect(mockTimerBudgets).toHaveLength(2);
        expect(mockPendingTimers).toHaveLength(0);
    });
});

describe('取消', () => {
    it('信号已经 abort 时连请求都不发', async () => {
        const controller = new AbortController();
        controller.abort();

        expect(await failureOf(makeStore(controller.signal).exists('/a'))).toBe(
            'cancelled',
        );
        expect(client.exists).not.toHaveBeenCalled();
    });

    it('在途 abort 报 cancelled 而非 timeout：用户自己停的不是服务器没回', async () => {
        const controller = new AbortController();
        client.stat.mockImplementation(
            (_path: string, options: { signal: AbortSignal }) =>
                hangUntilAbort(options.signal),
        );

        const pending = makeStore(controller.signal).testConnection();
        controller.abort();

        expect(await failureOf(pending)).toBe('cancelled');
        // 取消也要撤掉计时器
        expect(mockPendingTimers).toHaveLength(0);
    });

    it('带外部信号的库，超时仍报 timeout 而非 cancelled', async () => {
        // 连接面板在生产里总是带 signal 建库，所以「带 signal 的库上发生超时」才是它的常态；
        // 若这里错报 cancelled，面板会不显示任何结论——又是一次「点了没反应」
        const controller = new AbortController();
        client.stat.mockImplementation(
            (_path: string, options: { signal: AbortSignal }) =>
                hangUntilAbort(options.signal),
        );

        const pending = makeStore(controller.signal).testConnection();
        fireTimer();

        expect(await failureOf(pending)).toBe('timeout');
        expect(controller.signal.aborted).toBe(false);
    });

    it('带外部信号但没取消时，服务端的错误原样抛出，不许一律报成已取消', async () => {
        // 面板在生产里总是带 signal 建库，于是这条判断在每次探测失败时都会走到；
        // 若它只看「有没有信号」而不看「是否已 abort」，401 会被报成取消 →
        // 面板不显示任何结论，用户看到的还是「点了没反应」
        const controller = new AbortController();
        client.stat.mockRejectedValue(new Error('401 Unauthorized'));

        await expect(
            makeStore(controller.signal).testConnection(),
        ).rejects.toThrow('401');
    });

    it('取消不依赖底层认 signal：库无视它时也立刻以 cancelled 结算', async () => {
        // 与超时那条腿对称。只 abort 是「尽力」——底下若有一处没把 signal 传下去，
        // 用户按了取消就得干等到预算到点（可能几十分钟），锁一直占着
        const controller = new AbortController();
        client.stat.mockImplementation(
            () => new Promise<never>(() => undefined),
        );

        const pending = makeStore(controller.signal).testConnection();
        controller.abort();

        expect(await failureOf(pending)).toBe('cancelled');
        // 结算了就不该再留着计时器等到点
        expect(mockPendingTimers).toHaveLength(0);
    });

    it('预算到点会真去 abort 请求，而不只是让我们自己的 promise 结算', async () => {
        let seen: AbortSignal | undefined;
        client.stat.mockImplementation(
            (_path: string, options: { signal: AbortSignal }) => {
                seen = options.signal;
                return hangUntilAbort(options.signal);
            },
        );

        const pending = makeStore().testConnection();
        fireTimer();
        await failureOf(pending);

        // 光靠 race 抛错也能满足「结算」，但那会白占一条连接
        expect(seen?.aborted).toBe(true);
    });

    it('结算后摘掉外部信号的监听：长命的库不该越用越多监听器', async () => {
        const controller = new AbortController();
        const added = jest.spyOn(controller.signal, 'addEventListener');
        const removed = jest.spyOn(controller.signal, 'removeEventListener');
        const store = makeStore(controller.signal);

        await store.testConnection();
        await store.remove('/a.part');
        await store.moveFile('/a', '/b');

        expect(added).toHaveBeenCalledTimes(3);
        expect(removed).toHaveBeenCalledTimes(3);
        // 只数次数证明不了摘的是同一个回调——摘错了监听器照样泄漏
        for (const [index, call] of removed.mock.calls.entries()) {
            expect(call[1]).toBe(added.mock.calls[index]![1]);
        }
    });

    /*
     * 预算与取消同一轮到达（预算到点的同一个同步块里用户按了取消）
     *
     * 两种底层都要给出「取消」：**库认不认 signal 会走到不同的分支**——
     * 认的那条（生产里 webdav 就是它）让 run 的 AbortError 先赢下 race，落到 catch 里，
     * 此时 timedOut 与 external.aborted 同真，靠判断顺序定性；不认的那条由
     * cancellation 直接胜出。若只用不认 signal 的替身来测，就恰好绕开了生产那条路
     */
    describe('预算与取消同一轮到达时一律算取消', () => {
        it.each([
            [
                '底层认 signal（生产里的 webdav）',
                (signal: AbortSignal) => hangUntilAbort(signal),
            ],
            ['底层无视 signal', () => new Promise<never>(() => undefined)],
        ])('%s', async (_name, hang) => {
            const controller = new AbortController();
            client.stat.mockImplementation(
                (_path: string, options: { signal: AbortSignal }) =>
                    hang(options.signal),
            );

            const pending = makeStore(controller.signal).testConnection();
            fireTimer();
            controller.abort();

            // 报超时会让用户在按下取消之后反而挨一句「服务器一直没有响应」
            expect(await failureOf(pending)).toBe('cancelled');
        });
    });

    it('一个信号管整库：取消后同库上的后续请求也不再发出', async () => {
        const controller = new AbortController();
        const store = makeStore(controller.signal);
        controller.abort();

        expect(await failureOf(store.ensureDir('/MusicFree'))).toBe(
            'cancelled',
        );
        expect(await failureOf(store.writeFile('/a', 'x', 1))).toBe(
            'cancelled',
        );
        expect(await failureOf(store.moveFile('/a', '/b'))).toBe('cancelled');
        expect(await failureOf(store.remove('/a'))).toBe('cancelled');
        expect(client.createDirectory).not.toHaveBeenCalled();
        expect(client.putFileContents).not.toHaveBeenCalled();
        expect(client.moveFile).not.toHaveBeenCalled();
        expect(client.deleteFile).not.toHaveBeenCalled();
    });
});
