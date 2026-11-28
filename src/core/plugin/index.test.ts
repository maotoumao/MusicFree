import { setPlugins } from './store';

import { PluginManager } from '.';

import type {
    InstallResult,
    Plugin,
    PluginsTransfer,
    SubscribeSource,
} from './types';
import type { IConfig } from '@/core/config';

interface FakeStore {
    getString(key: string): string | undefined;
    getNumber(key: string): number | undefined;
    set(key: string, value: string | number): void;
    remove(key: string): void;
    getAllKeys(): string[];
    clearAll(): void;
}

// —— 依赖 mock：绕开原生（MMKV / fs / TagLib / sandbox 库）——

jest.mock('@/infra/storage', () => {
    const stores = new Map<string, FakeStore>();
    const create = (): FakeStore => {
        const strings = new Map<string, string>();
        const numbers = new Map<string, number>();
        return {
            getString: key => strings.get(key),
            getNumber: key => numbers.get(key),
            set: (key, value) => {
                if (typeof value === 'number') {
                    numbers.set(key, value);
                } else {
                    strings.set(key, value);
                }
            },
            remove: key => {
                strings.delete(key);
                numbers.delete(key);
            },
            getAllKeys: () => [...strings.keys(), ...numbers.keys()],
            clearAll: () => {
                strings.clear();
                numbers.clear();
            },
        };
    };
    return {
        __stores: stores,
        getOrCreateMMKV: (id: string) => {
            let store = stores.get(id);
            if (!store) {
                store = create();
                stores.set(id, store);
            }
            return store;
        },
        getObject: (store: FakeStore, key: string) => {
            const raw = store.getString(key);
            if (raw === undefined) {
                return undefined;
            }
            try {
                return JSON.parse(raw);
            } catch {
                return undefined;
            }
        },
        setObject: (store: FakeStore, key: string, value: unknown) => {
            if (value === undefined) {
                store.remove(key);
                return true;
            }
            store.set(key, JSON.stringify(value));
            return true;
        },
    };
});

const mockList = jest.fn<Promise<string[]>, []>(() => Promise.resolve([]));
jest.mock('./sourceStore', () => ({
    PluginSourceStore: class {
        list = mockList;
        read = jest.fn(() => Promise.resolve(''));
        save = jest.fn(() => Promise.resolve());
        remove = jest.fn(() => Promise.resolve());
    },
}));

// 判定改由 utils 的 isLocalPlatform 提供，故替身须用真实 wire 值，不能自造一个 'local'
jest.mock('./localPlugin', () => ({
    localPlugin: { platform: '本地', hash: 'local-plugin-hash' },
}));

// compile 假体：把 axios 返回的 JSON 源码解析成 definition（驱动真实安装路径的编译步骤）
jest.mock('./sandbox', () => ({
    compile: jest.fn((source: string) => ({
        definition: JSON.parse(source),
        supportedMethods: [],
    })),
    createSandboxEnv: jest.fn(() => ({})),
}));

// axios 假体：#fetchText 唯一的网络出口；按注册路由返回源码
jest.mock('axios', () => ({
    __esModule: true,
    default: { get: jest.fn() },
}));

jest.mock('@dr.pogodin/react-native-fs', () => ({ readFile: jest.fn() }));
// delay 永不 resolve：让 setup 的 fire-and-forget 清理段不真正执行、无悬挂定时器
jest.mock('@/infra/timer', () => ({
    delay: () => new Promise<void>(() => {}),
}));
jest.mock('@/infra/device', () => ({ appVersion: '1.0.0' }));
// hooks.ts 直接 import react-native-mmkv（ESM，Jest 不转译）；快照不用 hooks，stub 即可
jest.mock('react-native-mmkv', () => ({
    useMMKVObject: () => [undefined, jest.fn()],
    createMMKV: jest.fn(),
}));

const registry = (
    jest.requireMock('@/infra/storage') as {
        __stores: Map<string, FakeStore>;
    }
).__stores;

const axiosGet = (jest.requireMock('axios') as { default: { get: jest.Mock } })
    .default.get;

/** 注册 URL→源码路由；未注册的 URL 触发网络失败（模拟死链） */
function routeHttp(sources: Record<string, string>): void {
    axiosGet.mockImplementation((fullUrl: string) => {
        const base = fullUrl.split('?')[0] ?? '';
        if (!(base in sources)) {
            return Promise.reject(new Error('unrouted'));
        }
        return Promise.resolve({ data: sources[base] });
    });
}

/** 安装源码假体：编码 platform / version，供 compile 假体解析 */
function pluginSource(
    platform: string,
    version = '1.0.0',
    appVersion?: string,
): string {
    return JSON.stringify({ platform, version, appVersion });
}

let subscriptions: SubscribeSource[] = [];
/** 除订阅源外的配置值；用例按需塞入，未塞的读到 undefined（走各调用点的 ?? 默认） */
const configValues = new Map<string, unknown>();
const configWatchers = new Set<{ keys: readonly string[]; cb: () => void }>();
const config = {
    get: jest.fn((key: string) =>
        key === 'plugin.subscribeUrl' ? subscriptions : configValues.get(key),
    ),
    set: jest.fn(),
    subscribe: jest.fn((keys: readonly string[], cb: () => void) => {
        const entry = { keys, cb };
        configWatchers.add(entry);
        return () => configWatchers.delete(entry);
    }),
} as unknown as IConfig;

/** 改配置并同步派发订阅（对齐 MMKV 的同步回调） */
function setConfig(key: string, value: unknown): void {
    configValues.set(key, value);
    configWatchers.forEach(w => {
        if (w.keys.includes(key)) w.cb();
    });
}

/** 最小 Plugin 假体：快照只读 platform / srcUrl / version */
function fakePlugin(platform: string, over: Partial<Plugin> = {}): Plugin {
    return {
        platform,
        hash: `${platform}-hash`,
        state: 'ready',
        supportedMethods: new Set(),
        methods: {},
        load: () => Promise.resolve(),
        ...over,
    } as unknown as Plugin;
}

/** 直接把插件表灌进 atom（绕过 reconcile 的编译路径） */
function seedPlugins(plugins: Plugin[]): void {
    setPlugins(new Map(plugins.map(p => [p.platform, p])));
}

async function setupFresh(): Promise<PluginManager> {
    const manager = new PluginManager({ config });
    await manager.setup();
    return manager;
}

beforeEach(() => {
    // 清空各 store 内容而非移除实例：meta.ts 的 pluginMetaStore 在模块加载期已捕获，
    // 直接 registry.clear() 只会孤立该实例、其内容仍跨用例残留
    registry.forEach(store => store.clearAll());
    subscriptions = [];
    configValues.clear();
    configWatchers.clear();
    mockList.mockReset();
    mockList.mockResolvedValue([]);
    axiosGet.mockReset();
    (config.get as jest.Mock).mockClear();
    setPlugins(new Map());
});

describe('snapshotPlugins', () => {
    it('installed：按 order 排、仅 http(s) srcUrl、按 srcUrl 去重、排除无源', async () => {
        const manager = await setupFresh();
        seedPlugins([
            fakePlugin('a', { srcUrl: 'https://ex/a.js', version: '1.0.0' }),
            fakePlugin('b', { srcUrl: 'https://ex/b.js', version: '2.0.0' }),
            fakePlugin('c'), // 无 srcUrl（本地文件装）→ 略去
            fakePlugin('f', { srcUrl: 'file:///f.js' }), // 非 http(s) → 略去
        ]);
        manager.setOrder(['b', 'a', 'c', 'f']);

        const snap = await manager.snapshotPlugins();
        expect(snap.installed).toEqual([
            { srcUrl: 'https://ex/b.js', version: '2.0.0', enabled: true },
            { srcUrl: 'https://ex/a.js', version: '1.0.0', enabled: true },
        ]);
    });

    it('installed：enabled 反映禁用状态', async () => {
        const manager = await setupFresh();
        seedPlugins([fakePlugin('a', { srcUrl: 'https://ex/a.js' })]);
        manager.setOrder(['a']);
        manager.setEnabled('a', false);

        const snap = await manager.snapshotPlugins();
        expect(snap.installed[0]!.enabled).toBe(false);
    });

    it('subscriptions：仅 http(s)、按 url 去重（保首项、保序）', async () => {
        const manager = await setupFresh();
        subscriptions = [
            { name: '甲', url: 'https://ex/s1.json' },
            { name: '乙', url: 'https://ex/s1.json' }, // 同 url → 去重
            { name: '丙', url: 'file:///s2.json' }, // 非 http(s) → 略去
            { name: '丁', url: 'https://ex/s2.json' },
        ];

        const snap = await manager.snapshotPlugins();
        expect(snap.subscriptions).toEqual([
            { name: '甲', url: 'https://ex/s1.json' },
            { name: '丁', url: 'https://ex/s2.json' },
        ]);
    });

    it('alternatives：全量（含已卸载 platform 的偏好）、按 platform 排序', async () => {
        const manager = await setupFresh();
        seedPlugins([fakePlugin('a', { srcUrl: 'https://ex/a.js' })]);
        manager.setAlternative('b', 'x');
        manager.setAlternative('a', 'y');
        manager.setAlternative('gone', 'z'); // 该 platform 未安装，偏好仍应入备份

        const snap = await manager.snapshotPlugins();
        expect(snap.alternatives).toEqual([
            { platform: 'a', alternativePlatform: 'y' },
            { platform: 'b', alternativePlatform: 'x' },
            { platform: 'gone', alternativePlatform: 'z' },
        ]);
    });

    it('installed 条目只含 srcUrl/version/enabled，不泄漏用户变量', async () => {
        const manager = await setupFresh();
        seedPlugins([
            fakePlugin('a', {
                srcUrl: 'https://ex/a.js',
                version: '1.0.0',
                userVariables: [{ key: 'token', name: 'Token' }],
            }),
        ]);
        manager.setOrder(['a']);
        manager.setUserVariables('a', { token: 'secret' });

        const snap = await manager.snapshotPlugins();
        expect(Object.keys(snap.installed[0]!).sort()).toEqual([
            'enabled',
            'srcUrl',
            'version',
        ]);
    });

    it('对账失败 → 拒绝快照（不产出残缺备份）', async () => {
        mockList.mockRejectedValueOnce(new Error('fs 挂了'));
        const manager = new PluginManager({ config });
        await manager.setup().catch(() => undefined);

        await expect(manager.snapshotPlugins()).rejects.toThrow();
    });
});

/** 构造 restorePlugins 输入（缺省各段为空） */
function transfer(over: Partial<PluginsTransfer> = {}): PluginsTransfer {
    return {
        installed: [],
        subscriptions: [],
        alternatives: [],
        ...over,
    };
}

describe('网络地址安装：先看内容再决定怎么装', () => {
    it('地址不以 .json 结尾、内容却是订阅清单 → 按清单批量装，而不是当 JS 编译报解析失败', async () => {
        const manager = await setupFresh();
        routeHttp({
            'https://ex/sub': JSON.stringify({
                plugins: [
                    { url: 'https://ex/a.js' },
                    { url: 'https://ex/b.js' },
                ],
            }),
            'https://ex/a.js': pluginSource('pa'),
            'https://ex/b.js': pluginSource('pb'),
        });

        const results = await manager.installFromUrl('https://ex/sub');

        expect(results.map(r => (r.ok ? r.platform : r.reason)).sort()).toEqual(
            ['pa', 'pb'],
        );
    });

    it('拿回来的是网页（GitHub 页面链接、错误页）→ notPluginSource，不混进解析失败；.json 地址同样', async () => {
        const manager = await setupFresh();
        routeHttp({
            'https://ex/blob/plugin.js':
                '<!DOCTYPE html>\n<html><body>GitHub</body></html>',
            'https://ex/blob/sub.json': '\uFEFF  <html lang="en"><head>',
        });

        expect(
            await manager.installFromUrl('https://ex/blob/plugin.js'),
        ).toEqual([{ ok: false, reason: 'notPluginSource' }]);
        expect(
            await manager.installFromUrl('https://ex/blob/sub.json'),
        ).toEqual([{ ok: false, reason: 'notPluginSource' }]);
    });

    it('清单里的子项返回网页也报 notPluginSource（嗅探在取源入口，所有路径共用）', async () => {
        const manager = await setupFresh();
        routeHttp({
            'https://ex/s.json': JSON.stringify({
                plugins: [{ url: 'https://ex/page.js' }],
            }),
            'https://ex/page.js': '<html><body>404</body></html>',
        });

        expect(await manager.installFromUrl('https://ex/s.json')).toEqual([
            { ok: false, reason: 'notPluginSource' },
        ]);
    });

    it('以 <!-- 起头不被判成网页，照常走编译（本测试的 compile 假体解析不了它，故落 parseError）', async () => {
        const manager = await setupFresh();
        routeHttp({
            'https://ex/c.js': '<!-- header -->\n' + pluginSource('pc'),
        });

        const results = await manager.installFromUrl('https://ex/c.js');

        expect(results).toEqual([{ ok: false, reason: 'parseError' }]);
    });

    it('.json 地址返回的 JSON 里没有 plugins 数组 → invalid', async () => {
        const manager = await setupFresh();
        routeHttp({ 'https://ex/s.json': JSON.stringify({ hello: 1 }) });

        const results = await manager.installFromUrl('https://ex/s.json');

        expect(results).toEqual([{ ok: false, reason: 'invalid' }]);
    });

    it('请求失败带上状态码 / 超时作线索；拿不到线索就不带', async () => {
        const manager = await setupFresh();
        axiosGet.mockImplementationOnce(() =>
            Promise.reject({ response: { status: 404 } }),
        );
        expect(await manager.installFromUrl('https://ex/x.js')).toEqual([
            {
                ok: false,
                reason: 'network',
                detail: { kind: 'status', status: 404 },
            },
        ]);

        axiosGet.mockImplementationOnce(() =>
            Promise.reject({ code: 'ECONNABORTED' }),
        );
        expect(await manager.installFromUrl('https://ex/x.js')).toEqual([
            { ok: false, reason: 'network', detail: { kind: 'timeout' } },
        ]);

        axiosGet.mockImplementationOnce(() =>
            Promise.reject(new Error('unrouted')),
        );
        expect(await manager.installFromUrl('https://ex/x.js')).toEqual([
            { ok: false, reason: 'network', detail: undefined },
        ]);
    });
});

describe('两道版本闸互相独立', () => {
    // legacy 的 notCheckPluginVersion 原意只是「放行降级」，App 兼容检查在 legacy 是无开关的硬拦截；
    // 重写版把 App 兼容拆到 plugin.ignoreAppVersion，两者不得互相顶替
    const APP_MISMATCH = '>=99.0.0'; // 假体 appVersion 为 1.0.0

    async function installOlder(): Promise<InstallResult[]> {
        const manager = await setupFresh();
        routeHttp({
            'https://ex/new.js': pluginSource('dg', '2.0.0'),
            'https://ex/old.js': pluginSource('dg', '1.0.0'),
        });
        await manager.installFromUrl('https://ex/new.js');
        return manager.installFromUrl('https://ex/old.js');
    }

    async function installIncompatible(): Promise<InstallResult[]> {
        const manager = await setupFresh();
        routeHttp({
            'https://ex/inc.js': pluginSource('inc', '1.0.0', APP_MISMATCH),
        });
        return manager.installFromUrl('https://ex/inc.js');
    }

    it('默认两道闸都拦', async () => {
        expect((await installOlder())[0]).toMatchObject({
            ok: false,
            reason: 'olderVersion',
        });
        expect((await installIncompatible())[0]).toMatchObject({
            ok: false,
            reason: 'versionMismatch',
        });
    });

    it('notCheckPluginVersion 只放行降级，不放行 App 不兼容', async () => {
        configValues.set('basic.notCheckPluginVersion', true);

        expect((await installOlder())[0]).toMatchObject({ ok: true });
        expect((await installIncompatible())[0]).toMatchObject({
            ok: false,
            reason: 'versionMismatch',
        });
    });

    it('ignoreAppVersion 只放行 App 不兼容，不放行降级', async () => {
        configValues.set('plugin.ignoreAppVersion', true);

        expect((await installIncompatible())[0]).toMatchObject({ ok: true });
        expect((await installOlder())[0]).toMatchObject({
            ok: false,
            reason: 'olderVersion',
        });
    });

    it('翻开关即时改判已装插件，不必重启', async () => {
        configValues.set('plugin.ignoreAppVersion', true);
        const manager = await setupFresh();
        routeHttp({
            'https://ex/inc.js': pluginSource('inc', '1.0.0', APP_MISMATCH),
            'https://ex/ok.js': pluginSource('okp', '1.0.0'),
        });
        await manager.installFromUrl('https://ex/inc.js');
        await manager.installFromUrl('https://ex/ok.js');
        const healthy = manager.getByPlatform('okp');
        expect(manager.getByPlatform('inc')?.state).not.toBe('error');

        // 关掉忽略 → 不兼容的那个当场被判死
        setConfig('plugin.ignoreAppVersion', false);
        await manager.installFromUrl('https://ex/ok.js'); // 排空提交链

        expect(manager.getByPlatform('inc')?.state).toBe('error');
        expect(manager.getByPlatform('inc')?.errorReason).toBe(
            'versionMismatch',
        );
        // 判定没翻转的插件保持原实例：换掉等于白丢它的惰性编译结果
        expect(manager.getByPlatform('okp')).toBe(healthy);

        // 再打开 → 复活
        setConfig('plugin.ignoreAppVersion', true);
        await manager.installFromUrl('https://ex/ok.js');
        expect(manager.getByPlatform('inc')?.state).not.toBe('error');
    });

    it('降级开关变化不触发重建', async () => {
        const manager = await setupFresh();
        routeHttp({ 'https://ex/ok.js': pluginSource('okp', '1.0.0') });
        await manager.installFromUrl('https://ex/ok.js');
        const before = manager.getByPlatform('okp');

        setConfig('basic.notCheckPluginVersion', true);
        await manager.installFromUrl('https://ex/ok.js');

        expect(manager.getByPlatform('okp')).toBe(before);
    });

    it('live 列表缺项时不由兼容闸复活，避免拼出残缺列表', async () => {
        configValues.set('plugin.ignoreAppVersion', true);
        const manager = await setupFresh();
        routeHttp({
            'https://ex/inc.js': pluginSource('inc', '1.0.0', APP_MISMATCH),
            'https://ex/ok.js': pluginSource('okp', '1.0.0'),
        });
        await manager.installFromUrl('https://ex/inc.js');
        await manager.installFromUrl('https://ex/ok.js');

        // 模拟对账中途失败：注册表仍完整，live 列表却空了
        setPlugins(new Map());
        setConfig('plugin.ignoreAppVersion', false);
        await manager.installFromUrl('https://ex/ok.js');

        // 只把「判死的那个」塞回来会得到一份没有可用插件的残缺列表
        expect(manager.getAll()).toEqual([]);
    });
});

describe('restorePlugins', () => {
    it('新增排名保留已装和已卸载插件的历史排名，不压缩空位', async () => {
        const manager = await setupFresh();
        routeHttp({
            'https://ex/a.js': pluginSource('demo-a'),
            'https://ex/b.js': pluginSource('demo-b'),
            'https://ex/c.js': pluginSource('demo-c'),
            'https://ex/d.js': pluginSource('demo-d'),
        });
        await manager.installFromUrl('https://ex/a.js');
        await manager.installFromUrl('https://ex/c.js');
        manager.setOrder(['demo-a', 'demo-b', 'demo-c']);

        await manager.restorePlugins(
            transfer({
                installed: [{ srcUrl: 'https://ex/d.js', enabled: true }],
            }),
        );
        const order = JSON.parse(
            registry.get('plugin-meta')!.getString('order')!,
        );
        expect(order).toEqual(
            expect.objectContaining({
                'demo-a': 0,
                'demo-b': 1,
                'demo-c': 2,
            }),
        );
        expect(order['demo-d']).toBeGreaterThan(2);

        await manager.restorePlugins(
            transfer({
                installed: [{ srcUrl: 'https://ex/b.js', enabled: true }],
            }),
        );
        seedPlugins([...manager.getAll()].reverse());
        expect(
            manager.getOrder().filter(platform => platform.startsWith('demo-')),
        ).toEqual(['demo-a', 'demo-b', 'demo-c', 'demo-d']);
        expect(
            JSON.parse(registry.get('plugin-meta')!.getString('order')!),
        ).toEqual(order);
    });

    it('新装顺序写入现有 order，注册表重建顺序变化后仍保持恢复顺序', async () => {
        const manager = await setupFresh();
        routeHttp({
            'https://ex/existing.js': pluginSource('existing'),
            'https://ex/z.js': pluginSource('demo-z'),
            'https://ex/a.js': pluginSource('demo-a'),
            'https://ex/m.js': pluginSource('demo-m'),
        });
        await manager.installFromUrl('https://ex/existing.js');
        manager.setEnabled('existing', false);
        const previousOrder = manager.getOrder();
        await manager.restorePlugins(
            transfer({
                installed: [
                    { srcUrl: 'https://ex/z.js', enabled: true },
                    { srcUrl: 'https://ex/a.js', enabled: false },
                    { srcUrl: 'https://ex/m.js', enabled: true },
                ],
            }),
        );
        const expected = [...previousOrder, 'demo-z', 'demo-a', 'demo-m'];
        expect(manager.getOrder()).toEqual(expected);
        expect(registry.get('plugin-meta')?.getString('order')).toBeDefined();
        seedPlugins([...manager.getAll()].reverse());
        expect(manager.getOrder()).toEqual(expected);
        expect(manager.isEnabled('existing')).toBe(false);
        expect(manager.isEnabled('demo-a')).toBe(false);
    });

    it('新装：真安装并套用备份 enabled', async () => {
        const manager = await setupFresh();
        routeHttp({ 'https://ex/n.js': pluginSource('newp') });

        const result = await manager.restorePlugins(
            transfer({
                installed: [{ srcUrl: 'https://ex/n.js', enabled: false }],
            }),
        );

        expect(result.pluginsInstalled).toBe(1);
        expect(result.pluginsSkipped).toBe(0);
        expect(result.pluginInstallFailures).toEqual([]);
        // 真的进了注册表（非假绿）
        expect(manager.getByPlatform('newp')).toBeDefined();
        // enabled:false 应用到新装插件
        expect(manager.isEnabled('newp')).toBe(false);
    });

    it('已装同 srcUrl：跳过、免联网', async () => {
        const manager = await setupFresh();
        routeHttp({ 'https://ex/a.js': pluginSource('a') });
        await manager.installFromUrl('https://ex/a.js');
        axiosGet.mockClear();

        const result = await manager.restorePlugins(
            transfer({
                installed: [{ srcUrl: 'https://ex/a.js', enabled: true }],
            }),
        );

        expect(result.pluginsSkipped).toBe(1);
        expect(result.pluginsInstalled).toBe(0);
        // 快速路径命中，不发起网络请求
        expect(axiosGet).not.toHaveBeenCalled();
    });

    it('不同 srcUrl 但 platform 已装：跳过、不替换现有、不改其 enabled', async () => {
        const manager = await setupFresh();
        routeHttp({
            'https://ex/a.js': pluginSource('a', '1.0.0'),
            'https://ex/a-mirror.js': pluginSource('a', '2.0.0'),
        });
        await manager.installFromUrl('https://ex/a.js');

        const result = await manager.restorePlugins(
            transfer({
                installed: [
                    { srcUrl: 'https://ex/a-mirror.js', enabled: false },
                ],
            }),
        );

        expect(result.pluginsSkipped).toBe(1);
        expect(result.pluginsInstalled).toBe(0);
        // 现有插件未被镜像源替换（版本仍 1.0.0）
        expect(manager.getByPlatform('a')?.version).toBe('1.0.0');
        // 备份的 enabled:false 未覆盖本机现有插件（仍启用）
        expect(manager.isEnabled('a')).toBe(true);
    });

    it('platform 已装 + 源码声明不兼容 appVersion：仍跳过、不误报失败', async () => {
        const manager = await setupFresh();
        routeHttp({
            'https://ex/a.js': pluginSource('a', '1.0.0'),
            'https://ex/a-newapp.js': JSON.stringify({
                platform: 'a',
                version: '2.0.0',
                appVersion: '>=99.0.0',
            }),
        });
        await manager.installFromUrl('https://ex/a.js');

        const result = await manager.restorePlugins(
            transfer({
                installed: [
                    { srcUrl: 'https://ex/a-newapp.js', enabled: true },
                ],
            }),
        );

        // platform 已占 → 跳过（早于 appVersion 判断），不进失败通道
        expect(result.pluginsSkipped).toBe(1);
        expect(result.pluginInstallFailures).toEqual([]);
        expect(manager.getByPlatform('a')?.version).toBe('1.0.0');
    });

    it('批内同 platform 不同 srcUrl：第二条跳过、先到者胜', async () => {
        const manager = await setupFresh();
        routeHttp({
            'https://ex/x1.js': pluginSource('dup', '1.0.0'),
            'https://ex/x2.js': pluginSource('dup', '2.0.0'),
        });

        const result = await manager.restorePlugins(
            transfer({
                installed: [
                    { srcUrl: 'https://ex/x1.js', enabled: true },
                    { srcUrl: 'https://ex/x2.js', enabled: true },
                ],
            }),
        );

        expect(result.pluginsInstalled).toBe(1);
        expect(result.pluginsSkipped).toBe(1);
        expect(manager.getByPlatform('dup')?.version).toBe('1.0.0');
    });

    it('死链：计入 pluginInstallFailures(network)、不阻断其余', async () => {
        const manager = await setupFresh();
        // bad.js 未注册 → axios reject → network；good.js 正常
        routeHttp({ 'https://ex/good.js': pluginSource('good') });

        const result = await manager.restorePlugins(
            transfer({
                installed: [
                    { srcUrl: 'https://ex/bad.js', enabled: true },
                    { srcUrl: 'https://ex/good.js', enabled: true },
                ],
            }),
        );

        expect(result.pluginInstallFailures).toEqual([
            { srcUrl: 'https://ex/bad.js', reason: 'network' },
        ]);
        expect(result.pluginsInstalled).toBe(1);
        expect(manager.getByPlatform('good')).toBeDefined();
    });

    it('源码无法解析：计入 pluginInstallFailures(parseError)', async () => {
        const manager = await setupFresh();
        routeHttp({ 'https://ex/broken.js': 'not-valid-source{' });

        const result = await manager.restorePlugins(
            transfer({
                installed: [{ srcUrl: 'https://ex/broken.js', enabled: true }],
            }),
        );

        expect(result.pluginInstallFailures).toEqual([
            { srcUrl: 'https://ex/broken.js', reason: 'parseError' },
        ]);
        expect(result.pluginsInstalled).toBe(0);
    });

    it('对账失败：整段拒绝，不发起安装', async () => {
        mockList.mockRejectedValueOnce(new Error('fs 挂了'));
        const manager = new PluginManager({ config });
        await manager.setup().catch(() => undefined);
        routeHttp({ 'https://ex/n.js': pluginSource('newp') });

        await expect(
            manager.restorePlugins(
                transfer({
                    installed: [{ srcUrl: 'https://ex/n.js', enabled: true }],
                }),
            ),
        ).rejects.toThrow();
        expect(axiosGet).not.toHaveBeenCalled();
    });

    it('subscriptions：已有保留、同 url 跳过、新增追加', async () => {
        const manager = await setupFresh();
        subscriptions = [{ name: '现有', url: 'https://ex/s1.json' }];

        const result = await manager.restorePlugins(
            transfer({
                subscriptions: [
                    { name: '重复', url: 'https://ex/s1.json' },
                    { name: '新增', url: 'https://ex/s2.json' },
                ],
            }),
        );

        expect(result.subscriptionsAdded).toBe(1);
        expect(result.subscriptionsSkipped).toBe(1);
        expect(config.set).toHaveBeenCalledWith('plugin.subscribeUrl', [
            { name: '现有', url: 'https://ex/s1.json' },
            { name: '新增', url: 'https://ex/s2.json' },
        ]);
    });

    it('subscriptions：无新增时不写 config', async () => {
        const manager = await setupFresh();
        subscriptions = [{ name: '现有', url: 'https://ex/s1.json' }];
        (config.set as jest.Mock).mockClear();

        const result = await manager.restorePlugins(
            transfer({
                subscriptions: [{ name: '重复', url: 'https://ex/s1.json' }],
            }),
        );

        expect(result.subscriptionsAdded).toBe(0);
        expect(result.subscriptionsSkipped).toBe(1);
        expect(config.set).not.toHaveBeenCalled();
    });

    it('alternatives：已设保留、新增写入', async () => {
        const manager = await setupFresh();
        manager.setAlternative('a', 'existing-alt');

        const result = await manager.restorePlugins(
            transfer({
                alternatives: [
                    { platform: 'a', alternativePlatform: 'try-override' },
                    { platform: 'b', alternativePlatform: 'new-alt' },
                ],
            }),
        );

        expect(result.alternativesAdded).toBe(1);
        expect(result.alternativesSkipped).toBe(1);
        expect(manager.getAlternative('a')).toBe('existing-alt');
        expect(manager.getAlternative('b')).toBe('new-alt');
    });
});

describe('autoUpdate', () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    let now = 0;
    let nowSpy: jest.SpyInstance<number, []>;

    beforeEach(() => {
        now = 1_700_000_000_000;
        nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
        setConfig('basic.autoUpdatePlugin', true);
    });

    afterEach(() => {
        nowSpy.mockRestore();
    });

    /** 已装 a / b（都有源）与 c（无源，本地文件装的） */
    async function setupInstalled(): Promise<PluginManager> {
        const manager = await setupFresh();
        seedPlugins([
            fakePlugin('a', { srcUrl: 'https://ex/a.js' }),
            fakePlugin('b', { srcUrl: 'https://ex/b.js' }),
            fakePlugin('c'),
        ]);
        routeHttp({
            'https://ex/a.js': pluginSource('a', '2.0.0'),
            'https://ex/b.js': pluginSource('b', '2.0.0'),
        });
        return manager;
    }

    /** 本轮实际请求过的源地址（去掉 #fetchText 附加的查询串） */
    function requestedUrls(): string[] {
        return (axiosGet.mock.calls as [string][]).map(
            ([url]) => url.split('?')[0] ?? '',
        );
    }

    it('开关关：不更新，也不占用当天的节流额度', async () => {
        setConfig('basic.autoUpdatePlugin', false);
        const manager = await setupInstalled();

        await manager.autoUpdate();
        expect(axiosGet).not.toHaveBeenCalled();

        // 开关补开后立刻能跑 = 上一次没记账
        setConfig('basic.autoUpdatePlugin', true);
        await manager.autoUpdate();
        expect(axiosGet).toHaveBeenCalled();
    });

    it('开关关：不等启动对账即返回', async () => {
        setConfig('basic.autoUpdatePlugin', false);
        // 从不 setup：#ready 永不解除，若开关判定排在其后本用例会超时
        const manager = new PluginManager({ config });

        await expect(manager.autoUpdate()).resolves.toBeUndefined();
    });

    it('读配置抛错：不外泄', async () => {
        const manager = await setupInstalled();
        (config.get as jest.Mock).mockImplementationOnce(() => {
            throw new Error('MMKV 挂了');
        });

        await expect(manager.autoUpdate()).resolves.toBeUndefined();
        expect(axiosGet).not.toHaveBeenCalled();
    });

    it('启动对账失败：不更新也不记账', async () => {
        mockList.mockRejectedValueOnce(new Error('fs 挂了'));
        const manager = new PluginManager({ config });
        await manager.setup().catch(() => undefined);
        seedPlugins([fakePlugin('a', { srcUrl: 'https://ex/a.js' })]);
        routeHttp({ 'https://ex/a.js': pluginSource('a', '2.0.0') });

        await manager.autoUpdate();
        expect(axiosGet).not.toHaveBeenCalled();

        // 额度未被消耗：换一个对账正常的实例（共享同一份存储）立刻能跑
        const healthy = await setupFresh();
        seedPlugins([fakePlugin('a', { srcUrl: 'https://ex/a.js' })]);
        await healthy.autoUpdate();
        expect(axiosGet).toHaveBeenCalled();
    });

    it('只更新已启用且有源地址的插件', async () => {
        const manager = await setupInstalled();
        manager.setEnabled('b', false);

        await manager.autoUpdate();

        expect(requestedUrls()).toEqual(['https://ex/a.js']);
    });

    it('距上次不满一天：跳过', async () => {
        const manager = await setupInstalled();
        await manager.autoUpdate();
        const firstRound = axiosGet.mock.calls.length;

        now += DAY_MS - 1000;
        await manager.autoUpdate();

        expect(axiosGet).toHaveBeenCalledTimes(firstRound);
    });

    it('节流跨冷启动生效：新实例读到同一份记账', async () => {
        const manager = await setupInstalled();
        await manager.autoUpdate();
        const firstRound = axiosGet.mock.calls.length;

        now += DAY_MS - 1000;
        const restarted = await setupInstalled();
        await restarted.autoUpdate();

        expect(axiosGet).toHaveBeenCalledTimes(firstRound);
    });

    it('满一天：再跑一轮', async () => {
        const manager = await setupInstalled();
        await manager.autoUpdate();
        const firstRound = axiosGet.mock.calls.length;

        now += DAY_MS;
        await manager.autoUpdate();

        expect(axiosGet.mock.calls.length).toBeGreaterThan(firstRound);
    });

    it('时钟被调到未来又校回来：不长期锁死', async () => {
        const manager = await setupInstalled();
        await manager.autoUpdate();
        const firstRound = axiosGet.mock.calls.length;

        // 上次记账落在遥远的未来（记账时设备时钟是错的）
        now -= 30 * DAY_MS;
        await manager.autoUpdate();

        expect(axiosGet.mock.calls.length).toBeGreaterThan(firstRound);
    });

    it('更新途中抛错：不外泄，且当天不再重试（记账在开跑前）', async () => {
        const manager = await setupInstalled();
        const updateMany = jest
            .spyOn(manager, 'updateMany')
            .mockRejectedValue(new Error('boom'));

        await expect(manager.autoUpdate()).resolves.toBeUndefined();
        expect(updateMany).toHaveBeenCalled();

        updateMany.mockRestore();
        now += 1000;
        await manager.autoUpdate();
        expect(axiosGet).not.toHaveBeenCalled();
    });
});
