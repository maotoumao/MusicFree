import {
    copyFile,
    exists,
    mkdir,
    moveFile,
    readDir,
    stat,
    unlink,
    writeFile,
} from '@dr.pogodin/react-native-fs';

import { getOrCreateMMKV } from '@/infra/storage';

import {
    BUILTIN_DARK_PACK_ID,
    BUILTIN_LIGHT_PACK_ID,
    provideTheme,
    resolveBackgroundImageUri,
    theme as providedTheme,
    Theme,
} from '.';

import type { ThemeBackgroundBake } from '.';

let mockStored: unknown;
let mockStoreVersion = 0;
const mockValueListeners = new Set<(key: string) => void>();
const mockSetObject = jest.fn(
    (_store: unknown, _key: string, value: unknown) => {
        mockStored = value;
        mockValueListeners.forEach(listener => listener('preferences'));
        return true;
    },
);
const mockSetStoreVersion = jest.fn((_store: unknown, version: number) => {
    mockStoreVersion = version;
    mockValueListeners.forEach(listener => listener('$version'));
});

jest.mock('@/infra/storage', () => ({
    getOrCreateMMKV: jest.fn(() => ({
        getAllKeys: () => [
            ...(mockStoreVersion === 0 ? [] : ['$version']),
            ...(mockStored === undefined ? [] : ['preferences']),
        ],
        addOnValueChangedListener: (listener: (key: string) => void) => {
            mockValueListeners.add(listener);
            return { remove: () => mockValueListeners.delete(listener) };
        },
    })),
    getObject: () => mockStored,
    getStoreVersion: () => mockStoreVersion,
    setObject: (store: unknown, key: string, value: unknown) =>
        mockSetObject(store, key, value),
    setStoreVersion: (store: unknown, version: number) =>
        mockSetStoreVersion(store, version),
}));
jest.mock('@/infra/paths', () => ({ basePath: '/base' }));
jest.mock('@dr.pogodin/react-native-fs', () => ({
    copyFile: jest.fn(),
    exists: jest.fn(),
    mkdir: jest.fn(),
    moveFile: jest.fn(),
    readDir: jest.fn(),
    stat: jest.fn(),
    unlink: jest.fn(),
    writeFile: jest.fn(),
}));

const mockGetOrCreateMMKV = jest.mocked(getOrCreateMMKV);
const mockThemeStore = mockGetOrCreateMMKV.mock.results[0]!.value;
const mockExists = jest.mocked(exists);
const mockStat = jest.mocked(stat);
const mockMkdir = jest.mocked(mkdir);
const mockCopyFile = jest.mocked(copyFile);
const mockMoveFile = jest.mocked(moveFile);
const mockReadDir = jest.mocked(readDir);
const mockUnlink = jest.mocked(unlink);
const mockWriteFile = jest.mocked(writeFile);

const DEFAULT_SELECTION = {
    kind: 'system',
    dayPackId: BUILTIN_LIGHT_PACK_ID,
    nightPackId: BUILTIN_DARK_PACK_ID,
};

function resolvedStat(size: number): Awaited<ReturnType<typeof stat>> {
    return { size } as unknown as Awaited<ReturnType<typeof stat>>;
}

function dirEntry(
    name: string,
    isFile = true,
): Awaited<ReturnType<typeof readDir>>[number] {
    return {
        name,
        path: `/base/theme-background/${name}`,
        size: 42,
        mtime: null,
        ctime: null,
        isFile: () => isFile,
        isDirectory: () => !isFile,
    };
}

function storedPack(options?: Record<string, unknown>) {
    return {
        id: 'pack-1',
        name: '我的主题',
        scheme: 'dark',
        colors: {},
        background: null,
        autoContrast: true,
        ...options,
    };
}

function storedBackground(options?: Record<string, unknown>) {
    return {
        fileName: 'background-1.jpg',
        sourceFileName: 'source-1.jpg',
        blurRadius: 12,
        focusX: 0.5,
        focusY: 0.5,
        scale: 1,
        averageColor: '#405060',
        accentColor: null,
        visibility: 0.45,
        surfaceOpacity: 0.8,
        ...options,
    };
}

function backgroundBake(
    options?: Partial<ThemeBackgroundBake>,
): ThemeBackgroundBake {
    return {
        source: {
            kind: 'pick',
            uri: 'file:///cache/picked.jpg',
            name: 'a.jpg',
        },
        imageBase64: 'YmFzZTY0',
        blurRadius: 12,
        focusX: 0.5,
        focusY: 0.5,
        scale: 1,
        averageColor: '#405060',
        ...options,
    };
}

/** 建一个带背景的用户主题，返回其 id 与落库后的背景快照 */
async function createPackWithBackground(theme: Theme) {
    const id = theme.createPack(BUILTIN_DARK_PACK_ID, '我的主题');
    await theme.setPackBackground(id, backgroundBake());
    const background = theme.getPreferences().packs[0]!.background!;
    mockCopyFile.mockClear();
    mockWriteFile.mockClear();
    mockMoveFile.mockClear();
    mockUnlink.mockClear();
    mockSetObject.mockClear();
    return { id, background };
}

beforeEach(() => {
    mockStored = undefined;
    mockStoreVersion = 0;
    mockValueListeners.clear();
    mockSetObject.mockClear();
    mockSetObject.mockImplementation((_store, _key, value) => {
        mockStored = value;
        mockValueListeners.forEach(listener => listener('preferences'));
        return true;
    });
    mockSetStoreVersion.mockClear();
    mockExists.mockReset();
    mockExists.mockResolvedValue(true);
    mockStat.mockReset();
    mockStat.mockResolvedValue(resolvedStat(42));
    mockMkdir.mockReset();
    mockMkdir.mockResolvedValue(undefined);
    mockCopyFile.mockReset();
    mockCopyFile.mockResolvedValue(undefined);
    mockMoveFile.mockReset();
    mockMoveFile.mockResolvedValue(undefined);
    mockReadDir.mockReset();
    mockReadDir.mockResolvedValue([]);
    mockUnlink.mockReset();
    mockUnlink.mockResolvedValue(undefined);
    mockWriteFile.mockReset();
    mockWriteFile.mockResolvedValue(undefined);
});

describe('主题存储版本', () => {
    it('使用冻结的 MMKV store id 与版本，空 store 直接标记当前版本', () => {
        expect(mockGetOrCreateMMKV).toHaveBeenCalledWith('App.theme');

        new Theme();

        expect(mockSetStoreVersion).toHaveBeenCalledWith(mockThemeStore, 2);
        expect(mockSetObject).not.toHaveBeenCalled();
    });

    it('首次运行使用中央默认值', () => {
        expect(new Theme().getPreferences()).toEqual({
            packs: [],
            selection: DEFAULT_SELECTION,
        });
    });

    it('v1 主题偏好整体作废并升到 v2', () => {
        mockStoreVersion = 1;
        mockStored = { mode: 'dark', colors: {}, backgroundImage: null };

        const theme = new Theme();

        expect(mockSetObject).toHaveBeenCalledWith(
            mockThemeStore,
            'preferences',
            undefined,
        );
        expect(mockSetStoreVersion).toHaveBeenCalledWith(mockThemeStore, 2);
        expect(theme.getPreferences()).toEqual({
            packs: [],
            selection: DEFAULT_SELECTION,
        });
    });

    it('未知高版本保持只读，不降级覆盖未来数据', () => {
        mockStoreVersion = 99;
        mockStored = { packs: [storedPack()], selection: DEFAULT_SELECTION };

        const theme = new Theme();

        expect(mockSetStoreVersion).not.toHaveBeenCalled();
        expect(theme.getPreferences()).toEqual({
            packs: [],
            selection: DEFAULT_SELECTION,
        });
        expect(() => theme.selectPack(BUILTIN_DARK_PACK_ID)).toThrow(
            '当前版本无法修改该主题偏好',
        );
        expect(mockSetObject).not.toHaveBeenCalled();
    });

    it('无版本但非空的 store 保持只读，等待显式迁移', () => {
        mockStoreVersion = 0;
        mockStored = { packs: [], selection: DEFAULT_SELECTION };

        const theme = new Theme();

        expect(mockSetStoreVersion).not.toHaveBeenCalled();
        expect(() => theme.selectPack(BUILTIN_LIGHT_PACK_ID)).toThrow(
            '当前版本无法修改该主题偏好',
        );
    });
});

describe('主题选择', () => {
    it('固定选择与跟随系统互相切换，且校验主题存在', () => {
        const theme = new Theme();

        theme.selectPack(BUILTIN_DARK_PACK_ID);
        expect(theme.getPreferences().selection).toEqual({
            kind: 'fixed',
            packId: BUILTIN_DARK_PACK_ID,
        });

        theme.selectSystemPacks(BUILTIN_DARK_PACK_ID, BUILTIN_LIGHT_PACK_ID);
        expect(theme.getPreferences().selection).toEqual({
            kind: 'system',
            dayPackId: BUILTIN_DARK_PACK_ID,
            nightPackId: BUILTIN_LIGHT_PACK_ID,
        });

        expect(() => theme.selectPack('missing')).toThrow(TypeError);
        expect(() =>
            theme.selectSystemPacks(BUILTIN_LIGHT_PACK_ID, 'missing'),
        ).toThrow(TypeError);
    });

    it('相同选择不重复写入或通知', () => {
        const theme = new Theme();
        const listener = jest.fn();
        const unsubscribe = theme.subscribe(listener);

        theme.selectSystemPacks(BUILTIN_LIGHT_PACK_ID, BUILTIN_DARK_PACK_ID);
        theme.selectPack(BUILTIN_LIGHT_PACK_ID);
        theme.selectPack(BUILTIN_LIGHT_PACK_ID);

        expect(mockSetObject).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledTimes(1);

        unsubscribe();
        theme.selectPack(BUILTIN_DARK_PACK_ID);
        expect(listener).toHaveBeenCalledTimes(1);
    });
});

describe('用户主题', () => {
    it('从内置主题复制出用户主题，继承 base 与配色但不共享背景', () => {
        const theme = new Theme();
        theme.selectPack(BUILTIN_DARK_PACK_ID);

        const id = theme.createPack(BUILTIN_DARK_PACK_ID, '  夜色  ');

        expect(theme.getPreferences().packs).toEqual([
            {
                id,
                name: '夜色',
                scheme: 'dark',
                colors: {},
                background: null,
                autoContrast: true,
            },
        ]);
    });

    it('拒绝空名、超长名与不存在的源主题', () => {
        const theme = new Theme();

        expect(() => theme.createPack(BUILTIN_LIGHT_PACK_ID, '   ')).toThrow(
            RangeError,
        );
        expect(() =>
            theme.createPack(BUILTIN_LIGHT_PACK_ID, 'x'.repeat(25)),
        ).toThrow(RangeError);
        expect(() => theme.createPack('missing', '名字')).toThrow(TypeError);
        expect(theme.getPreferences().packs).toEqual([]);
    });

    it('主题数量达到上限后拒绝新建', () => {
        const theme = new Theme();
        for (let index = 0; index < 20; index += 1) {
            theme.createPack(BUILTIN_LIGHT_PACK_ID, `主题${index}`);
        }

        expect(() =>
            theme.createPack(BUILTIN_LIGHT_PACK_ID, '再来一个'),
        ).toThrow(RangeError);
        expect(theme.getPreferences().packs).toHaveLength(20);
    });

    it('颜色覆盖规范为大写 HEX 并保留 alpha，null 恢复继承', () => {
        const theme = new Theme();
        const id = theme.createPack(BUILTIN_LIGHT_PACK_ID, '主题');

        theme.setPackColor(id, 'primary', '#f2600a80');
        theme.setPackColor(id, 'text', '#111111');
        expect(theme.getPreferences().packs[0]!.colors).toEqual({
            primary: '#F2600A80',
            text: '#111111',
        });

        theme.setPackColor(id, 'text', null);
        expect(theme.getPreferences().packs[0]!.colors).toEqual({
            primary: '#F2600A80',
        });

        theme.resetPackColors(id);
        expect(theme.getPreferences().packs[0]!.colors).toEqual({});
    });

    it('非法角色、非法颜色与内置主题写入一律抛错且不落库', () => {
        const theme = new Theme();
        const id = theme.createPack(BUILTIN_LIGHT_PACK_ID, '主题');
        mockSetObject.mockClear();

        expect(() =>
            theme.setPackColor(id, 'coverText' as never, '#111111'),
        ).toThrow(TypeError);
        expect(() => theme.setPackColor(id, 'primary', 'red')).toThrow(
            TypeError,
        );
        expect(() =>
            theme.setPackColor(BUILTIN_LIGHT_PACK_ID, 'primary', '#111111'),
        ).toThrow(TypeError);
        expect(() =>
            theme.setPackColor('missing', 'primary', '#111111'),
        ).toThrow(TypeError);
        expect(() => theme.renamePack(BUILTIN_DARK_PACK_ID, '改名')).toThrow(
            TypeError,
        );
        expect(mockSetObject).not.toHaveBeenCalled();
    });

    it('重命名与文字自适配开关按值去重', () => {
        const theme = new Theme();
        const id = theme.createPack(BUILTIN_LIGHT_PACK_ID, '主题');
        mockSetObject.mockClear();

        theme.renamePack(id, '主题');
        theme.setPackAutoContrast(id, true);
        expect(mockSetObject).not.toHaveBeenCalled();

        theme.renamePack(id, '新名字');
        theme.setPackAutoContrast(id, false);
        expect(theme.getPreferences().packs[0]).toMatchObject({
            name: '新名字',
            autoContrast: false,
        });
    });

    it('删除主题时回收其背景文件，并把选择回落到同 base 的内置主题', async () => {
        const theme = new Theme();
        const { id, background } = await createPackWithBackground(theme);
        theme.selectSystemPacks(BUILTIN_LIGHT_PACK_ID, id);

        await theme.deletePack(id);

        expect(theme.getPreferences()).toEqual({
            packs: [],
            selection: {
                kind: 'system',
                dayPackId: BUILTIN_LIGHT_PACK_ID,
                nightPackId: BUILTIN_DARK_PACK_ID,
            },
        });
        expect(mockUnlink).toHaveBeenCalledWith(
            `/base/theme-background/${background.fileName}`,
        );
        expect(mockUnlink).toHaveBeenCalledWith(
            `/base/theme-background/${background.sourceFileName}`,
        );
    });

    it('删除主题只在被选中时改写选择', async () => {
        const theme = new Theme();
        const kept = theme.createPack(BUILTIN_LIGHT_PACK_ID, '保留');
        const removed = theme.createPack(BUILTIN_LIGHT_PACK_ID, '删除');
        theme.selectPack(kept);

        await theme.deletePack(removed);

        expect(theme.getPreferences().selection).toEqual({
            kind: 'fixed',
            packId: kept,
        });
    });
});

describe('损坏数据回退', () => {
    it('逐条丢弃非法主题，保留可用条目并钳制背景参数', () => {
        mockStoreVersion = 2;
        mockStored = {
            packs: [
                storedPack({
                    id: 'ok',
                    colors: { primary: '#abcdef', bogus: '#111111', text: 12 },
                    background: storedBackground({
                        blurRadius: 999,
                        visibility: -1,
                        surfaceOpacity: 5,
                        scale: 0,
                        averageColor: 'not-a-color',
                    }),
                    autoContrast: false,
                }),
                storedPack({ id: 'ok' }),
                storedPack({ id: BUILTIN_LIGHT_PACK_ID }),
                storedPack({ id: 12 }),
                'not-a-pack',
            ],
            selection: { kind: 'fixed', packId: 'gone' },
        };

        expect(new Theme().getPreferences()).toEqual({
            packs: [
                {
                    id: 'ok',
                    name: '我的主题',
                    scheme: 'dark',
                    colors: { primary: '#ABCDEF' },
                    background: {
                        fileName: 'background-1.jpg',
                        sourceFileName: 'source-1.jpg',
                        blurRadius: 60,
                        focusX: 0.5,
                        focusY: 0.5,
                        scale: 1,
                        averageColor: '#808080',
                        accentColor: null,
                        visibility: 0,
                        surfaceOpacity: 1,
                    },
                    autoContrast: false,
                },
            ],
            selection: DEFAULT_SELECTION,
        });
    });

    it('背景文件名不安全时整段背景作废，主题其余字段保留', () => {
        mockStoreVersion = 2;
        mockStored = {
            packs: [
                storedPack({
                    background: storedBackground({ fileName: '../escape.jpg' }),
                }),
                storedPack({
                    id: 'pack-2',
                    background: storedBackground({ sourceFileName: '' }),
                }),
            ],
            selection: DEFAULT_SELECTION,
        };

        const packs = new Theme().getPreferences().packs;
        expect(packs).toHaveLength(2);
        expect(packs[0]!.background).toBeNull();
        expect(packs[1]!.background).toBeNull();
        expect(packs[0]!.name).toBe('我的主题');
    });

    it('跟随系统选择的失效槽位逐个回落内置主题', () => {
        mockStoreVersion = 2;
        mockStored = {
            packs: [storedPack({ id: 'kept', scheme: 'light' })],
            selection: {
                kind: 'system',
                dayPackId: 'kept',
                nightPackId: 'gone',
            },
        };

        expect(new Theme().getPreferences().selection).toEqual({
            kind: 'system',
            dayPackId: 'kept',
            nightPackId: BUILTIN_DARK_PACK_ID,
        });
    });
});

describe('并发与生命周期', () => {
    it('多个实例始终基于 MMKV 当前值提交，不覆盖彼此字段', () => {
        const first = new Theme();
        const second = new Theme();
        const id = first.createPack(BUILTIN_LIGHT_PACK_ID, '主题');

        second.selectPack(BUILTIN_DARK_PACK_ID);
        first.setPackColor(id, 'primary', '#111111');

        expect(second.getPreferences()).toEqual({
            packs: [
                expect.objectContaining({ id, colors: { primary: '#111111' } }),
            ],
            selection: { kind: 'fixed', packId: BUILTIN_DARK_PACK_ID },
        });
    });

    it('持久化失败时不发布尚未落库的状态', () => {
        const theme = new Theme();
        mockSetObject.mockReturnValueOnce(false);

        expect(() => theme.selectPack(BUILTIN_DARK_PACK_ID)).toThrow(
            '主题偏好序列化失败',
        );
        expect(theme.getPreferences().selection).toEqual(DEFAULT_SELECTION);
    });

    it('provideTheme 更新公开 live-binding', () => {
        const theme = new Theme();
        provideTheme(theme);

        expect(providedTheme).toBe(theme);
    });

    it('单门入口提供托管背景 URI 解析', () => {
        expect(resolveBackgroundImageUri('background-1.jpg')).toBe(
            'file:///base/theme-background/background-1.jpg',
        );
    });
});

describe('主题背景事务', () => {
    it('先落原图与位图再提交偏好，替换时删除被顶掉的旧文件', async () => {
        const theme = new Theme();
        const { id, background } = await createPackWithBackground(theme);

        await theme.setPackBackground(id, backgroundBake());

        const next = theme.getPreferences().packs[0]!.background!;
        expect(next.fileName).not.toBe(background.fileName);
        expect(next.sourceFileName).not.toBe(background.sourceFileName);
        // 图层参数不随烘焙载荷走，沿用落库时的当前值
        expect(next.visibility).toBe(background.visibility);
        expect(mockUnlink).toHaveBeenCalledWith(
            `/base/theme-background/${background.fileName}`,
        );
        expect(mockUnlink).toHaveBeenCalledWith(
            `/base/theme-background/${background.sourceFileName}`,
        );
    });

    it('主色调随烘焙落库并规范为大写；载荷缺省即 null', async () => {
        const theme = new Theme();
        const { id } = await createPackWithBackground(theme);

        await theme.setPackBackground(
            id,
            backgroundBake({ accentColor: '#ff8c1a' }),
        );
        expect(theme.getPreferences().packs[0]!.background!.accentColor).toBe(
            '#FF8C1A',
        );

        await theme.setPackBackground(
            id,
            backgroundBake({ source: { kind: 'keep' } }),
        );
        expect(
            theme.getPreferences().packs[0]!.background!.accentColor,
        ).toBeNull();
    });

    it('复用原图时不复制图片，只换渲染位图', async () => {
        const theme = new Theme();
        const { id, background } = await createPackWithBackground(theme);

        await theme.setPackBackground(
            id,
            backgroundBake({ source: { kind: 'keep' }, blurRadius: 30 }),
        );

        const next = theme.getPreferences().packs[0]!.background!;
        expect(mockCopyFile).not.toHaveBeenCalled();
        expect(next.sourceFileName).toBe(background.sourceFileName);
        expect(next.blurRadius).toBe(30);
        expect(mockUnlink).toHaveBeenCalledTimes(1);
        expect(mockUnlink).toHaveBeenCalledWith(
            `/base/theme-background/${background.fileName}`,
        );
    });

    it('无原图可复用时拒绝，且不触碰文件', async () => {
        const theme = new Theme();
        const id = theme.createPack(BUILTIN_LIGHT_PACK_ID, '主题');

        await expect(
            theme.setPackBackground(
                id,
                backgroundBake({ source: { kind: 'keep' } }),
            ),
        ).rejects.toThrow('当前主题没有可复用的背景原图');
        expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('位图写入失败时删除刚落盘的原图并保留旧背景', async () => {
        const theme = new Theme();
        const { id, background } = await createPackWithBackground(theme);
        mockWriteFile.mockRejectedValueOnce(new Error('disk full'));

        await expect(
            theme.setPackBackground(id, backgroundBake()),
        ).rejects.toThrow('disk full');

        expect(theme.getPreferences().packs[0]!.background).toEqual(background);
        // 临时文件 + 已发布的新原图
        expect(mockUnlink).toHaveBeenCalledWith(
            expect.stringMatching('/base/theme-background/source-'),
        );
    });

    it('偏好落库失败时删除两个新文件并保留旧背景', async () => {
        const theme = new Theme();
        const { id, background } = await createPackWithBackground(theme);
        mockSetObject.mockReturnValueOnce(false);

        await expect(
            theme.setPackBackground(id, backgroundBake()),
        ).rejects.toThrow('主题偏好序列化失败');

        expect(theme.getPreferences().packs[0]!.background).toEqual(background);
        const removed = mockUnlink.mock.calls.map(call => String(call[0]));
        expect(removed.some(path => path.includes('/background-'))).toBe(true);
        expect(removed.some(path => path.includes('/source-'))).toBe(true);
    });

    it('非法参数在文件操作前拒绝', async () => {
        const theme = new Theme();
        const id = theme.createPack(BUILTIN_LIGHT_PACK_ID, '主题');

        await expect(
            theme.setPackBackground(id, backgroundBake({ blurRadius: 61 })),
        ).rejects.toThrow(RangeError);
        await expect(
            theme.setPackBackground(id, backgroundBake({ scale: 0.5 })),
        ).rejects.toThrow(RangeError);
        await expect(
            theme.setPackBackground(
                id,
                backgroundBake({ accentColor: 'not-a-color' }),
            ),
        ).rejects.toThrow(TypeError);
        await expect(
            theme.setPackBackground(
                id,
                backgroundBake({ accentColor: '#12345680' }),
            ),
        ).rejects.toThrow(TypeError);
        await expect(
            theme.setPackBackground(
                id,
                backgroundBake({ averageColor: 'not-a-color' }),
            ),
        ).rejects.toThrow(TypeError);
        await expect(
            theme.setPackBackground(id, backgroundBake({ imageBase64: '' })),
        ).rejects.toThrow(TypeError);
        expect(mockCopyFile).not.toHaveBeenCalled();
        expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('图层参数就地更新，不复制文件；相同值不重复落库', async () => {
        const theme = new Theme();
        const { id } = await createPackWithBackground(theme);

        theme.setPackBackgroundLayers(id, 0.6, 0.5);
        theme.setPackBackgroundLayers(id, 0.6, 0.5);

        expect(mockSetObject).toHaveBeenCalledTimes(1);
        expect(theme.getPreferences().packs[0]!.background).toMatchObject({
            visibility: 0.6,
            surfaceOpacity: 0.5,
        });
        expect(mockCopyFile).not.toHaveBeenCalled();
    });

    it('无背景时调整图层参数静默跳过，非法取值仍然抛错', () => {
        const theme = new Theme();
        const id = theme.createPack(BUILTIN_LIGHT_PACK_ID, '主题');
        mockSetObject.mockClear();

        // 背景可能刚被清掉，调用方持有的快照会短暂滞后：这不是调用方的错，不该抛给它
        expect(() => theme.setPackBackgroundLayers(id, 0.5, 0.5)).not.toThrow();
        expect(mockSetObject).not.toHaveBeenCalled();

        expect(() => theme.setPackBackgroundLayers(id, 2, 0.5)).toThrow(
            RangeError,
        );
    });

    it('清除时先发布无背景状态，再 best-effort 删除两个文件', async () => {
        const theme = new Theme();
        const { id, background } = await createPackWithBackground(theme);

        await theme.clearPackBackground(id);

        expect(theme.getPreferences().packs[0]!.background).toBeNull();
        expect(mockSetObject.mock.invocationCallOrder[0]!).toBeLessThan(
            mockUnlink.mock.invocationCallOrder[0]!,
        );
        expect(mockUnlink).toHaveBeenCalledWith(
            `/base/theme-background/${background.fileName}`,
        );
        expect(mockUnlink).toHaveBeenCalledWith(
            `/base/theme-background/${background.sourceFileName}`,
        );

        mockSetObject.mockClear();
        await theme.clearPackBackground(id);
        expect(mockSetObject).not.toHaveBeenCalled();
    });

    it('失败操作不阻塞队列中的后续操作', async () => {
        const theme = new Theme();
        const id = theme.createPack(BUILTIN_LIGHT_PACK_ID, '主题');
        mockCopyFile.mockRejectedValueOnce(new Error('copy failed'));

        const failing = theme.setPackBackground(id, backgroundBake());
        const following = theme.setPackBackground(id, backgroundBake());

        await expect(failing).rejects.toThrow('copy failed');
        await expect(following).resolves.toBeUndefined();
        expect(theme.getPreferences().packs[0]!.background).not.toBeNull();
    });
});

describe('主题背景启动对账', () => {
    it('并发与重复 setup 共享同一次对账', async () => {
        const theme = new Theme();
        const first = theme.setup();
        const second = theme.setup();

        expect(first).toBe(second);
        await expect(first).resolves.toBeUndefined();
    });

    it('渲染位图缺失时清除该主题背景，其余主题不受影响', async () => {
        mockStoreVersion = 2;
        mockStored = {
            packs: [
                storedPack({
                    id: 'broken',
                    background: storedBackground({
                        fileName: 'background-gone.jpg',
                        sourceFileName: 'source-gone.jpg',
                    }),
                }),
                storedPack({
                    id: 'intact',
                    background: storedBackground({
                        fileName: 'background-here.jpg',
                        sourceFileName: 'source-here.jpg',
                    }),
                }),
            ],
            selection: DEFAULT_SELECTION,
        };
        mockReadDir.mockResolvedValue([
            dirEntry('background-here.jpg'),
            dirEntry('source-here.jpg'),
            dirEntry('source-gone.jpg'),
        ]);

        const theme = new Theme();
        await theme.setup();

        const packs = theme.getPreferences().packs;
        expect(packs[0]!.background).toBeNull();
        expect(packs[1]!.background).not.toBeNull();
    });

    it('只有原图缺失时保留背景显示', async () => {
        mockStoreVersion = 2;
        mockStored = {
            packs: [
                storedPack({
                    background: storedBackground({
                        fileName: 'background-here.jpg',
                        sourceFileName: 'source-gone.jpg',
                    }),
                }),
            ],
            selection: DEFAULT_SELECTION,
        };
        mockReadDir.mockResolvedValue([dirEntry('background-here.jpg')]);

        const theme = new Theme();
        await theme.setup();

        expect(theme.getPreferences().packs[0]!.background).not.toBeNull();
        expect(mockSetObject).not.toHaveBeenCalled();
    });

    it('清理目录中无主的托管与临时文件', async () => {
        mockStoreVersion = 2;
        mockStored = { packs: [], selection: DEFAULT_SELECTION };
        mockReadDir.mockResolvedValue([
            dirEntry('background-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'),
            dirEntry('source-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'),
            dirEntry('unrelated.txt'),
        ]);

        await new Theme().setup();

        expect(mockUnlink).toHaveBeenCalledTimes(2);
        expect(mockUnlink).not.toHaveBeenCalledWith(
            '/base/theme-background/unrelated.txt',
        );
    });

    it('目录不可读时不修复引用也不清理文件', async () => {
        mockStoreVersion = 2;
        mockStored = {
            packs: [storedPack({ background: storedBackground() })],
            selection: DEFAULT_SELECTION,
        };
        mockReadDir.mockRejectedValue(new Error('read failed'));

        const theme = new Theme();
        await theme.setup();

        expect(theme.getPreferences().packs[0]!.background).not.toBeNull();
        expect(mockUnlink).not.toHaveBeenCalled();
        expect(mockSetObject).not.toHaveBeenCalled();
    });

    it('未知版本跳过文件系统对账且不修改偏好', async () => {
        mockStoreVersion = 99;
        mockStored = { packs: [], selection: DEFAULT_SELECTION };

        await new Theme().setup();

        expect(mockReadDir).not.toHaveBeenCalled();
        expect(mockSetObject).not.toHaveBeenCalled();
    });

    it('扫描期间版本升级时不再清理新版可能引用的文件', async () => {
        mockStoreVersion = 2;
        mockStored = { packs: [], selection: DEFAULT_SELECTION };
        let releaseScan: () => void = () => undefined;
        mockReadDir.mockReturnValue(
            new Promise(resolve => {
                releaseScan = () =>
                    resolve([
                        dirEntry(
                            'background-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg',
                        ),
                    ]);
            }) as ReturnType<typeof readDir>,
        );

        const setup = new Theme().setup();
        mockStoreVersion = 3;
        releaseScan();
        await setup;

        expect(mockUnlink).not.toHaveBeenCalled();
    });
});

describe('页面底色必须不透明，其余角色可带 alpha', () => {
    it('页面底色拒绝半透明，卡片与文字照常接受', () => {
        const theme = new Theme();
        const id = theme.createPack(BUILTIN_LIGHT_PACK_ID, '主题');

        // 页面底是整个合成链的基准面：半透明会让「用户看到什么颜色」失去参照
        expect(() => theme.setPackColor(id, 'background', '#11223380')).toThrow(
            TypeError,
        );

        // 卡片调透正是自定义背景下不想让它糊成一块的手段
        theme.setPackColor(id, 'surface', '#FFFFFF66');
        theme.setPackColor(id, 'text', '#111111CC');
        theme.setPackColor(id, 'border', '#11223380');
        expect(theme.getPreferences().packs[0]!.colors).toEqual({
            surface: '#FFFFFF66',
            text: '#111111CC',
            border: '#11223380',
        });
    });

    it('存储里真半透明的页面底被丢弃，其余角色的 alpha 原样保留', () => {
        mockStoreVersion = 2;
        mockStored = {
            packs: [
                storedPack({
                    colors: {
                        background: '#11223380',
                        surface: '#44556680',
                        primary: '#abcdef80',
                    },
                }),
            ],
            selection: DEFAULT_SELECTION,
        };

        expect(new Theme().getPreferences().packs[0]!.colors).toEqual({
            surface: '#44556680',
            primary: '#ABCDEF80',
        });
    });

    it('命令侧与存储侧同一口径：#RRGGBBFF 截断收下而非抛错', () => {
        const theme = new Theme();
        const id = theme.createPack(BUILTIN_LIGHT_PACK_ID, '主题');

        // 语义上就是不透明，两侧口径不一会出现「存进去能读、当场设却报错」
        expect(() =>
            theme.setPackColor(id, 'background', '#112233FF'),
        ).not.toThrow();
        expect(theme.getPreferences().packs[0]!.colors).toEqual({
            background: '#112233',
        });
    });

    it('存储里语义上已不透明的页面底截断为六位而非丢弃', () => {
        mockStoreVersion = 2;
        mockStored = {
            packs: [storedPack({ colors: { background: '#112233ff' } })],
            selection: DEFAULT_SELECTION,
        };

        expect(new Theme().getPreferences().packs[0]!.colors).toEqual({
            background: '#112233',
        });
    });
});
