import { MAX_ERROR_RECORDS, MAX_STACK_CHARS } from './types';

import { ErrorLog, errorLog } from '.';

import type { ErrorLogEnvironment } from './types';
import type { IPluginManager } from '@/core/plugin';

const mockStore = {
    data: new Map<string, string>(),
    getString: (k: string) => mockStore.data.get(k),
    set: (k: string, v: string) => mockStore.data.set(k, v),
    delete: (k: string) => mockStore.data.delete(k),
    contains: (k: string) => mockStore.data.has(k),
};

jest.mock('@/infra/storage', () => ({
    getOrCreateMMKV: () => mockStore,
    getObject: (_m: unknown, key: string) => {
        const raw = mockStore.data.get(key);
        return raw === undefined ? undefined : JSON.parse(raw);
    },
    setObject: (_m: unknown, key: string, value: unknown) => {
        mockStore.data.set(key, JSON.stringify(value));
        return true;
    },
}));

jest.mock('@/infra/installationId', () => ({
    getInstallationId: () => 'test-install-id',
}));

jest.mock('@/infra/navigation', () => ({
    navigationRef: {
        isReady: () => true,
        getCurrentRoute: () => ({ name: 'PlaylistDetail' }),
    },
}));

jest.mock('./store', () => ({ setErrorRecords: jest.fn() }));

let mockNow = 1_700_000_000_000;

const environment: ErrorLogEnvironment = {
    appVersion: '0.5.2',
    buildNumber: '41',
    os: 'android',
    osVersion: '14',
    deviceModel: 'Pixel 7',
    now: () => mockNow,
};

/** 插件替身：一个启用带版本、一个启用无版本、一个禁用 */
function pluginManager(): IPluginManager {
    return {
        getAll: () => [
            { platform: 'demo', version: '0.1.2' },
            { platform: 'local' },
            { platform: 'disabled-one', version: '9.9' },
        ],
        isEnabled: (platform: string) => platform !== 'disabled-one',
    } as unknown as IPluginManager;
}

function makeLog(): ErrorLog {
    return new ErrorLog({ pluginManager: pluginManager(), environment });
}

function throwing(message: string, frame = 'at foo (bundle:1:100)'): Error {
    const error = new Error(message);
    error.stack = `Error: ${message}\n    ${frame}\n    at bar (bundle:1:200)`;
    return error;
}

beforeEach(() => {
    mockStore.data.clear();
    mockNow = 1_700_000_000_000;
});

describe('记录', () => {
    it('保留最近 N 条，超出丢最旧的', () => {
        const log = makeLog();
        for (let i = 0; i < MAX_ERROR_RECORDS + 5; i += 1) {
            mockNow += 1000;
            log.capture({ source: 'render', error: throwing(`第 ${i} 个`) });
        }
        const records = log.getRecords();

        expect(records).toHaveLength(MAX_ERROR_RECORDS);
        expect(records[0]?.message).toBe(`第 ${MAX_ERROR_RECORDS + 4} 个`);
    });

    it('连续重复只累加计数，不新增记录——渲染错误容易成环，逐条记会把旧记录冲光', () => {
        const log = makeLog();
        for (let i = 0; i < 50; i += 1) {
            log.capture({ source: 'render', error: throwing('同一个错') });
        }
        const records = log.getRecords();

        expect(records).toHaveLength(1);
        expect(records[0]?.count).toBe(50);
    });

    it('栈首帧不同就是两起事故', () => {
        const log = makeLog();
        log.capture({
            source: 'render',
            error: throwing('同名', 'at a (bundle:1:1)'),
        });
        log.capture({
            source: 'render',
            error: throwing('同名', 'at b (bundle:1:2)'),
        });

        expect(log.getRecords()).toHaveLength(2);
    });

    it('重复计数的落盘被限流，一秒内只写一次', () => {
        const log = makeLog();
        const writes = () =>
            JSON.parse(mockStore.data.get('records') ?? '[]')[0]?.count ?? 0;

        log.capture({ source: 'render', error: throwing('刷屏') });
        for (let i = 0; i < 100; i += 1) {
            log.capture({ source: 'render', error: throwing('刷屏') });
        }

        // 内存里已累加到 101，但盘上还是首次落的那一份
        expect(log.getRecords()[0]?.count).toBe(101);
        expect(writes()).toBe(1);

        mockNow += 2000;
        log.capture({ source: 'render', error: throwing('刷屏') });

        expect(writes()).toBe(102);
    });

    it('超长栈只截尾部——头部帧是符号化最需要的', () => {
        const log = makeLog();
        const error = new Error('长栈');
        error.stack = `Error: 长栈\n    at head (bundle:1:1)\n${'x'.repeat(
            MAX_STACK_CHARS * 2,
        )}`;
        log.capture({ source: 'render', error });
        const stack = log.getRecords()[0]?.stack ?? '';

        expect(stack.startsWith('Error: 长栈\n    at head (bundle:1:1)')).toBe(
            true,
        );
        expect(stack).toContain('已截断');
    });

    it('抛出的不是 Error 也能记——插件是第三方代码，什么都可能扔', () => {
        const log = makeLog();
        log.capture({ source: 'uncaught', error: { weird: true } });

        expect(log.getRecords()[0]?.name).toBe('NonError');
    });

    it('清空后不留记录', () => {
        const log = makeLog();
        log.capture({ source: 'render', error: throwing('x') });
        log.clear();

        expect(log.getRecords()).toHaveLength(0);
    });
});

describe('报告', () => {
    it('栈逐字保真——metro-symbolicate 吃的是精确的行:列', () => {
        const log = makeLog();
        const error = new Error('崩了');
        // 首尾留白是刻意的：真实 Hermes 栈常带尾换行，而任何 trim / 重排都会
        // 让 metro-symbolicate 对不上偏移
        const raw =
            'Error: 崩了\n    at a (bundle:1:284917)\n    at b (bundle:1:301442)\n';
        error.stack = raw;
        log.capture({ source: 'render', error });
        const report = log.formatReport(log.getRecords()[0]!.id) ?? '';

        // 对记录本身断言全等：只查 report 包含它会被 join 的分隔符掩盖——
        // 尾换行被 trim 掉后，拼接时又补了一个回来，substring 照样命中
        expect(log.getRecords()[0]?.stack).toBe(raw);
        expect(report).toContain(raw);
    });

    it('版本与 build 在最前：map 是逐次构建的产物，版本对不上会静默映射到错处', () => {
        const log = makeLog();
        log.capture({ source: 'render', error: throwing('x') });
        const report = log.formatReport(log.getRecords()[0]!.id) ?? '';

        expect(report.split('\n')[1]).toContain('0.5.2 (41)');
    });

    it('带出事时的路由与来源', () => {
        const log = makeLog();
        log.capture({ source: 'uncaught', error: throwing('x') });
        const report = log.formatReport(log.getRecords()[0]!.id) ?? '';

        expect(report).toContain('PlaylistDetail');
        expect(report).toContain('未捕获异常');
    });

    it('只出已启用插件的 platform 与 version', () => {
        const log = makeLog();
        log.capture({ source: 'render', error: throwing('x') });
        const report = log.formatReport(log.getRecords()[0]!.id) ?? '';

        expect(report).toContain('demo 0.1.2');
        expect(report).toContain('local');
        expect(report).not.toContain('disabled-one');
    });

    it('id 不存在时返回 undefined', () => {
        expect(makeLog().formatReport('不存在')).toBeUndefined();
    });
});

describe('隐私红线', () => {
    it('报告里不出现插件的用户变量值——那对音乐插件通常就是凭据', () => {
        const log = new ErrorLog({
            environment,
            pluginManager: {
                getAll: () => [
                    {
                        platform: 'demo',
                        version: '0.1.2',
                        // 插件对象上挂着凭据；报告只能取 platform 与 version
                        userVariables: [{ key: 'cookie' }],
                        userVariableValues: { cookie: 'SECRET-TOKEN-VALUE' },
                    },
                ],
                isEnabled: () => true,
            } as unknown as IPluginManager,
        });
        log.capture({ source: 'render', error: throwing('x') });
        const report = log.formatReport(log.getRecords()[0]!.id) ?? '';

        expect(report).not.toContain('SECRET-TOKEN-VALUE');
        expect(report).not.toContain('cookie');
    });
});

describe('凭据脱敏', () => {
    /** 插件能 `throw new Error(env.userVariables.cookie)`——凭据从自由文本进报告 */
    function logWithSecret(secret: string): ErrorLog {
        return new ErrorLog({
            environment,
            pluginManager: {
                getAll: () => [{ platform: 'demo', version: '1.0' }],
                isEnabled: () => true,
                getUserVariables: () => ({ cookie: secret }),
            } as unknown as IPluginManager,
        });
    }

    it('抹掉出现在 message 与 stack 里的插件变量值', () => {
        const secret = 'SESSION-abcdef123456';
        const log = logWithSecret(secret);
        const error = new Error(`请求失败 ${secret}`);
        error.stack = `Error: 请求失败 ${secret}\n    at a (bundle:1:1)`;
        log.capture({ source: 'uncaught', error });
        const report = log.formatReport(log.getRecords()[0]!.id) ?? '';

        expect(report).not.toContain(secret);
        expect(report).toContain('***');
        // 栈帧本身不含秘密，必须原样留着供符号化
        expect(report).toContain('at a (bundle:1:1)');
    });

    it('过短的值不抹——那种到处都是，抹了反而把栈搅烂', () => {
        const log = logWithSecret('1');
        log.capture({ source: 'uncaught', error: throwing('at bundle:1:1') });
        const report = log.formatReport(log.getRecords()[0]!.id) ?? '';

        expect(report).toContain('bundle:1:1');
    });
});

describe('记录的身份与写盘', () => {
    it('同毫秒同 name 的两个错误 id 不同——撞 id 会让复制旧记录复制到新的那条', () => {
        const log = makeLog();
        log.capture({ source: 'render', error: throwing('甲') });
        log.capture({ source: 'render', error: throwing('乙') });
        // newest-first：[0] 是后发生的乙
        const [newest, older] = log.getRecords();

        expect(newest!.id).not.toBe(older!.id);
        // 撞 id 时 find() 会对两个 id 都返回队首，旧记录就复制不出来
        expect(log.formatReport(newest!.id)).toContain('乙');
        expect(log.formatReport(older!.id)).toContain('甲');
    });

    it('两个错误交替出现也不会每次都写盘——它们条条都是「新记录」', () => {
        const log = makeLog();
        let writes = 0;
        const store = mockStore.data;
        const original = store.set.bind(store);
        (store as { set: typeof original }).set = (k, v) => {
            writes += 1;
            return original(k, v);
        };

        for (let i = 0; i < 20; i += 1) {
            log.capture({ source: 'render', error: throwing('甲') });
            log.capture({ source: 'render', error: throwing('乙') });
        }
        (store as { set: typeof original }).set = original;

        // 首条走 leading 边立即落盘，其余 39 次都在窗口内被合并
        expect(writes).toBe(1);
    });

    it('窗口内的最后状态由 trailing flush 落盘，不会永远停在旧值', () => {
        const log = makeLog();
        log.capture({ source: 'render', error: throwing('刷屏') });
        for (let i = 0; i < 30; i += 1) {
            log.capture({ source: 'render', error: throwing('刷屏') });
        }
        expect(JSON.parse(mockStore.data.get('records')!)[0].count).toBe(1);

        log.flush();

        expect(JSON.parse(mockStore.data.get('records')!)[0].count).toBe(31);
    });
});

describe('极端输入', () => {
    it('连字符串化都会抛的值也能记下，不整条丢掉', () => {
        const log = makeLog();
        const hostile = {
            toJSON() {
                throw new Error('toJSON 抛了');
            },
            [Symbol.toPrimitive]() {
                throw new Error('toPrimitive 抛了');
            },
        };
        log.capture({ source: 'uncaught', error: hostile });

        expect(log.getRecords()).toHaveLength(1);
        expect(typeof log.getRecords()[0]?.message).toBe('string');
    });

    it('抛 undefined 时 message 仍是字符串', () => {
        const log = makeLog();
        log.capture({ source: 'uncaught', error: undefined });

        expect(typeof log.getRecords()[0]?.message).toBe('string');
    });
});

describe('发布给 UI 的引用', () => {
    it('重复计数变化后发的是新数组——同引用 set 会被 jotai 判无变化、一个订阅者都不通知', () => {
        const published: unknown[] = [];
        const { setErrorRecords } = jest.requireMock('./store') as {
            setErrorRecords: jest.Mock;
        };
        setErrorRecords.mockImplementation((r: unknown) => published.push(r));

        const log = makeLog();
        log.capture({ source: 'render', error: throwing('反复') });
        mockNow += 2000;
        log.capture({ source: 'render', error: throwing('反复') });

        const [first, second] = published.slice(-2);
        expect(first).not.toBe(second);
        setErrorRecords.mockReset();
    });

    it('getRecords 不把内部活数组交出去', () => {
        const log = makeLog();
        log.capture({ source: 'render', error: throwing('x') });

        expect(log.getRecords()).not.toBe(log.getRecords());
    });
});

describe('装配前的替身', () => {
    it('模块导出的 errorLog 开箱可用，不是 undefined', () => {
        expect(() =>
            errorLog.capture({ source: 'render', error: new Error('装配前') }),
        ).not.toThrow();
        expect(errorLog.getRecords()[0]?.message).toBe('装配前');
        expect(errorLog.formatReport(errorLog.getRecords()[0]!.id)).toContain(
            '装配前',
        );
    });
});
