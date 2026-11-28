/**
 * AppUpdate 单测：多源并发取最高版本、清单形状校验、下载地址协议白名单、
 * 版本号严格校验（范围表达式不得被当成新版）、「已最新」与「取不到清单」的区分
 * 清单来自网络、不可信，故校验用例比正常路径多
 */
import axios from 'axios';

import { AppUpdate } from '.';

const mockStorageCells = new Map<string, unknown>();
const mockGetOrCreateMMKV = jest.fn((_id: string) => ({}));
const mockGetObject = jest.fn((key: string) => mockStorageCells.get(key));
const mockSetObject = jest.fn((key: string, value: unknown) => {
    if (value === undefined) {
        mockStorageCells.delete(key);
    } else {
        mockStorageCells.set(key, value);
    }
    return true;
});
const mockCompareVersionsOverride = jest.fn();

jest.mock('compare-versions', () => {
    const actual =
        jest.requireActual<typeof import('compare-versions')>(
            'compare-versions',
        );
    return {
        ...actual,
        compareVersions: (...args: Parameters<typeof actual.compareVersions>) =>
            mockCompareVersionsOverride(...args) ??
            actual.compareVersions(...args),
    };
});

jest.mock('@/infra/storage', () => ({
    getOrCreateMMKV: (id: string) => mockGetOrCreateMMKV(id),
    getObject: (_store: unknown, key: string) => mockGetObject(key),
    setObject: (_store: unknown, key: string, value: unknown) =>
        mockSetObject(key, value),
}));

jest.mock('axios', () => ({
    __esModule: true,
    default: { get: jest.fn() },
}));

// 本机版本固定，让比对结果只取决于清单
jest.mock('@/infra/device', () => ({ appVersion: '1.0.0' }));

const mockedGet = axios.get as jest.MockedFunction<typeof axios.get>;

const HOSTS = ['gitee.com', 'raw.githubusercontent.com', 'cdn.jsdelivr.net'];

/** 按源下标给出各自的响应；给 undefined 表示该源连不上 */
function respondEach(dataByIndex: readonly unknown[]): void {
    mockedGet.mockImplementation((async (url: string) => {
        const hit = HOSTS.findIndex(host => url.includes(host));
        const data = dataByIndex[hit];
        if (data === undefined) {
            throw new Error('network down');
        }
        return { data };
    }) as unknown as typeof axios.get);
}

/** 三个源返回同一份清单 */
function respondAll(data: unknown): void {
    respondEach([data, data, data]);
}

const validRelease = {
    version: '2.0.0',
    changeLog: ['修了一堆东西'],
    download: ['https://example.com/app.apk'],
};

/** 恶意样本：正是要被协议白名单挡住的东西 */
// eslint-disable-next-line no-script-url
const SCRIPT_URL = 'javascript:alert(1)';

beforeEach(() => {
    mockedGet.mockReset();
    mockStorageCells.clear();
    mockGetOrCreateMMKV.mockClear();
    mockGetObject.mockClear();
    mockSetObject.mockClear();
    mockCompareVersionsOverride.mockReset();
});

describe('AppUpdate 跳过版本', () => {
    it('使用 App.PersistStatus store', () => {
        const update = new AppUpdate();
        expect(update).toBeInstanceOf(AppUpdate);
        expect(mockGetOrCreateMMKV).toHaveBeenCalledWith('App.PersistStatus');
    });

    it('沿用 legacy app.skipVersion，并跳过该版本及更低版本', () => {
        mockStorageCells.set('app.skipVersion', '2.0.0');
        const update = new AppUpdate();

        expect(update.isVersionSkipped('2.0.0')).toBe(true);
        expect(update.isVersionSkipped('1.9.0')).toBe(true);
        expect(update.isVersionSkipped('2.1.0')).toBe(false);
    });

    it('可设置并清除跳过版本', () => {
        const update = new AppUpdate();

        update.setVersionSkipped('2.0.0', true);
        expect(mockStorageCells.get('app.skipVersion')).toBe('2.0.0');

        update.setVersionSkipped('2.0.0', false);
        expect(mockStorageCells.has('app.skipVersion')).toBe(false);
    });

    it('忽略损坏的持久值', () => {
        mockStorageCells.set('app.skipVersion', 'not-a-version');
        expect(new AppUpdate().isVersionSkipped('2.0.0')).toBe(false);
    });
});

describe('AppUpdate.check', () => {
    const DAY_MS = 24 * 60 * 60 * 1000;

    it('未满 24 小时时 checkIfDue 不发请求', async () => {
        const now = 2_000_000_000_000;
        jest.spyOn(Date, 'now').mockReturnValue(now);
        mockStorageCells.set('app.lastUpdateCheckAt', now - DAY_MS + 1);
        respondAll(validRelease);

        await expect(new AppUpdate().checkIfDue()).resolves.toBeUndefined();
        expect(mockedGet).not.toHaveBeenCalled();

        jest.restoreAllMocks();
    });

    it('满 24 小时时 checkIfDue 发起检查并刷新时间', async () => {
        const now = 2_000_000_000_000;
        jest.spyOn(Date, 'now').mockReturnValue(now);
        mockStorageCells.set('app.lastUpdateCheckAt', now - DAY_MS);
        respondAll(validRelease);

        await expect(new AppUpdate().checkIfDue()).resolves.toMatchObject({
            kind: 'available',
        });
        expect(mockedGet).toHaveBeenCalledTimes(HOSTS.length);
        expect(mockStorageCells.get('app.lastUpdateCheckAt')).toBe(now);

        jest.restoreAllMocks();
    });

    it('手动 check 刷新时间，随后自动检查受频控', async () => {
        const now = 2_000_000_000_000;
        jest.spyOn(Date, 'now').mockReturnValue(now);
        respondAll(validRelease);
        const update = new AppUpdate();

        await update.check();
        await expect(update.checkIfDue()).resolves.toBeUndefined();
        expect(mockedGet).toHaveBeenCalledTimes(HOSTS.length);

        jest.restoreAllMocks();
    });

    it('网络失败仍记录本次尝试时间', async () => {
        const now = 2_000_000_000_000;
        jest.spyOn(Date, 'now').mockReturnValue(now);
        mockedGet.mockRejectedValue(new Error('network down'));

        await expect(new AppUpdate().check()).resolves.toEqual({
            kind: 'failed',
        });
        expect(mockStorageCells.get('app.lastUpdateCheckAt')).toBe(now);

        jest.restoreAllMocks();
    });

    it('未来时间戳不阻止自动检查', async () => {
        const now = 2_000_000_000_000;
        jest.spyOn(Date, 'now').mockReturnValue(now);
        mockStorageCells.set('app.lastUpdateCheckAt', now + DAY_MS);
        respondAll(validRelease);

        await expect(new AppUpdate().checkIfDue()).resolves.toMatchObject({
            kind: 'available',
        });
        expect(mockedGet).toHaveBeenCalledTimes(HOSTS.length);

        jest.restoreAllMocks();
    });

    it('记录检查时间失败时 resolve failed，不同步抛错或访问网络', async () => {
        mockSetObject.mockImplementationOnce(() => {
            throw new Error('storage down');
        });
        respondAll(validRelease);

        await expect(new AppUpdate().check()).resolves.toEqual({
            kind: 'failed',
        });
        expect(mockedGet).not.toHaveBeenCalled();
    });

    it('内部检查意外抛错时仍 resolve failed', async () => {
        respondAll(validRelease);
        mockCompareVersionsOverride.mockImplementation(() => {
            throw new Error('compare failed');
        });

        await expect(new AppUpdate().check()).resolves.toEqual({
            kind: 'failed',
        });
    });

    it('远端版本更高时报告可更新，并原样带出清单', async () => {
        respondAll(validRelease);
        await expect(new AppUpdate().check()).resolves.toEqual({
            kind: 'available',
            release: {
                version: '2.0.0',
                changeLog: ['修了一堆东西'],
                downloadUrls: ['https://example.com/app.apk'],
            },
        });
    });

    it('远端版本不高于本机时报告已最新', async () => {
        respondAll({ ...validRelease, version: '1.0.0' });
        await expect(new AppUpdate().check()).resolves.toEqual({
            kind: 'upToDate',
        });
    });

    it('镜像同步有先后：先答的源还是旧版时，仍取其余源里最高的那份', async () => {
        respondEach([
            { ...validRelease, version: '1.0.0' },
            { ...validRelease, version: '3.0.0' },
            { ...validRelease, version: '2.0.0' },
        ]);
        await expect(new AppUpdate().check()).resolves.toMatchObject({
            kind: 'available',
            release: { version: '3.0.0' },
        });
        expect(mockedGet).toHaveBeenCalledTimes(HOSTS.length);
    });

    it('并发检查复用同一组镜像请求', async () => {
        respondAll(validRelease);
        const update = new AppUpdate();

        await Promise.all([update.check(), update.check()]);

        expect(mockedGet).toHaveBeenCalledTimes(HOSTS.length);
    });

    it('检查完成后释放在途请求，后续调用重新检查', async () => {
        respondAll(validRelease);
        const update = new AppUpdate();

        await update.check();
        await update.check();

        expect(mockedGet).toHaveBeenCalledTimes(HOSTS.length * 2);
    });

    it('部分源连不上时用取得到的那些', async () => {
        respondEach([undefined, undefined, validRelease]);
        await expect(new AppUpdate().check()).resolves.toMatchObject({
            kind: 'available',
        });
    });

    it('所有源都取不到时报告失败，而不是谎称已最新', async () => {
        mockedGet.mockRejectedValue(new Error('network down'));
        await expect(new AppUpdate().check()).resolves.toEqual({
            kind: 'failed',
        });
    });

    it('清单形状不对时视为该源不可用', async () => {
        respondEach([{ version: '', download: [] }, undefined, validRelease]);
        await expect(new AppUpdate().check()).resolves.toMatchObject({
            kind: 'available',
        });
    });

    it('容忍版本号的前导 v', async () => {
        respondAll({ ...validRelease, version: 'v2.0.0' });
        await expect(new AppUpdate().check()).resolves.toMatchObject({
            release: { version: '2.0.0' },
        });
    });

    describe('版本号严格校验', () => {
        // compareVersions 对这些**不抛错反而判为更新**，只靠 try/catch 兜不住
        it.each(['999.x', '^999.0.0', '>=999.0.0', '~9.9.9', '不是版本号'])(
            '拒绝 %s 这类非具体版本，不报虚假更新',
            async version => {
                respondAll({ ...validRelease, version });
                await expect(new AppUpdate().check()).resolves.toEqual({
                    kind: 'failed',
                });
            },
        );

        it('拒绝超长版本号', async () => {
            respondAll({ ...validRelease, version: `2.0.${'9'.repeat(100)}` });
            await expect(new AppUpdate().check()).resolves.toEqual({
                kind: 'failed',
            });
        });
    });

    describe('下载地址', () => {
        it('过滤掉非 https 的地址（含明文 http）', async () => {
            respondAll({
                ...validRelease,
                download: [
                    SCRIPT_URL,
                    'intent://evil',
                    'http://example.com/plain.apk',
                    'https://example.com/ok.apk',
                ],
            });
            await expect(new AppUpdate().check()).resolves.toMatchObject({
                release: { downloadUrls: ['https://example.com/ok.apk'] },
            });
        });

        it('过滤掉没有主机的畸形地址', async () => {
            respondAll({ ...validRelease, download: ['https://'] });
            await expect(new AppUpdate().check()).resolves.toEqual({
                kind: 'failed',
            });
        });

        it('过滤掉超长地址', async () => {
            respondAll({
                ...validRelease,
                download: [`https://example.com/${'a'.repeat(3000)}`],
            });
            await expect(new AppUpdate().check()).resolves.toEqual({
                kind: 'failed',
            });
        });

        it('地址过多时截断', async () => {
            respondAll({
                ...validRelease,
                download: Array.from(
                    { length: 20 },
                    (_, i) => `https://example.com/${i}.apk`,
                ),
            });
            const result = await new AppUpdate().check();
            expect(
                result.kind === 'available'
                    ? result.release.downloadUrls.length
                    : -1,
            ).toBe(5);
        });
    });

    describe('更新说明', () => {
        it('丢掉非字符串项与空行', async () => {
            respondAll({
                ...validRelease,
                changeLog: ['一行', 42, null, '   '],
            });
            await expect(new AppUpdate().check()).resolves.toMatchObject({
                release: { changeLog: ['一行'] },
            });
        });

        it('条数与单条长度都封顶，撑不爆对话框', async () => {
            respondAll({
                ...validRelease,
                changeLog: Array.from({ length: 500 }, () => 'x'.repeat(5000)),
            });
            const result = await new AppUpdate().check();
            const changeLog =
                result.kind === 'available' ? result.release.changeLog : [];
            expect(changeLog).toHaveLength(30);
            expect(changeLog[0]).toHaveLength(200);
        });

        it('剔除控制字符', async () => {
            respondAll({
                ...validRelease,
                changeLog: ['前\u0000中\u001F后'],
            });
            await expect(new AppUpdate().check()).resolves.toMatchObject({
                release: { changeLog: ['前中后'] },
            });
        });
    });
});
