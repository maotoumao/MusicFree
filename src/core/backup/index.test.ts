import { CachesDirectoryPath, stat, unlink } from '@dr.pogodin/react-native-fs';

import { readUtf8File } from '@/infra/fileSystem';
import { createTextFileWriter } from '@/infra/fileWriter';
import { saveToDownloads } from '@/infra/sharedStorage';
import { TimeoutError } from '@/infra/timer';
import { createWebdavStore, WebdavRequestError } from '@/infra/webdav';

import {
    classifyRestoreResult,
    gateLocalMedia,
    restoreMusicSheetsSection,
    restoreStarredPlaylistsSection,
} from './restore';

import { Backup, classifyBackupFailure, describeBackupFailure } from '.';

import type { BackupDeps } from '.';
import type {
    BackupSections,
    ParsedBackup,
    RestoreBackupResult,
} from './types';
import type { ConfigKey, ConfigSchema } from '@/core/config';
import type { LocalPlaylistRestoreResult } from '@/core/playlist';
import type { PluginsRestoreResult } from '@/core/plugin';
import type { TextFileWriter } from '@/infra/fileWriter';

// —— 依赖 mock：Backup 只直接 import 这三处（端口经构造注入，用 fake）——
jest.mock('@/infra/device', () => ({ os: 'android', appVersion: '1.2.3' }));
jest.mock('@/infra/installationId', () => ({
    getInstallationId: () => 'install-xyz',
}));
jest.mock('@/utils/media', () => ({
    ...jest.requireActual('@/utils/media'),
    LOCAL_MEDIA_PLATFORM: '本地',
}));
jest.mock('@dr.pogodin/react-native-fs', () => ({
    CachesDirectoryPath: '/caches',
    stat: jest.fn(),
    unlink: jest.fn(),
}));
jest.mock('@/infra/timer', () => ({
    delay: (ms: number, options: { signal: AbortSignal }) =>
        new Promise<void>((resolve, reject) => {
            const handle = setTimeout(resolve, ms);
            options.signal.addEventListener(
                'abort',
                () => {
                    clearTimeout(handle);
                    reject(
                        Object.assign(new Error('cancelled'), {
                            name: 'AbortError',
                        }),
                    );
                },
                { once: true },
            );
        }),
    TimeoutError: class extends Error {
        constructor() {
            super('timeout');
            this.name = 'TimeoutError';
        }
    },
}));
jest.mock('@/infra/fileSystem', () => ({ readUtf8File: jest.fn() }));
jest.mock('@/infra/fileWriter', () => ({
    createTextFileWriter: jest.fn(),
}));
jest.mock('@/infra/sharedStorage', () => ({
    saveToDownloads: jest.fn(),
}));
/*
 * 真模块会引到 @/infra/timer → NativeTimer TurboModule，测试环境拿不到
 * `WebdavRequestError` 给一个替身：被测代码与本文件拿到的是**同一个**类，
 * 故 `instanceof` 语义与生产一致；替身只需满足 classifyBackupFailure 用到的契约（kind）
 */
jest.mock('@/infra/webdav', () => ({
    createWebdavStore: jest.fn(),
    WebdavRequestError: class extends Error {
        readonly kind: string;

        constructor(kind: string) {
            super(kind);
            this.name = 'WebdavRequestError';
            this.kind = kind;
        }
    },
}));
// 换成递增值：临时路径可预期，才能断言两次导出确实用了不同的名字
jest.mock('uuid', () => {
    let seq = 0;
    return {
        v4: () => {
            seq += 1;
            return `uuid-${seq}`;
        },
    };
});

const mockUnlink = jest.mocked(unlink);
const mockReadFile = jest.mocked(readUtf8File);
const mockStat = jest.mocked(stat);
const mockCreateTextFileWriter = jest.mocked(createTextFileWriter);
const mockSaveToDownloads = jest.mocked(saveToDownloads);
const mockCreateWebdavStore = jest.mocked(createWebdavStore);

const webdavStore = {
    testConnection: jest.fn(),
    exists: jest.fn(),
    getFileSize: jest.fn(),
    ensureDir: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    moveFile: jest.fn(),
    remove: jest.fn(),
};

/** 收集写入文本的假写入器；close 汇报的字节数可控 */
function fakeWriter(): {
    text: () => string;
    writer: TextFileWriter;
    setBytes: (value: number) => void;
} {
    const chunks: string[] = [];
    let bytes = 0;
    return {
        text: () => chunks.join(''),
        setBytes: value => {
            bytes = value;
        },
        writer: {
            write: chunk => {
                chunks.push(chunk);
                return Promise.resolve();
            },
            close: () => Promise.resolve(bytes),
        },
    };
}

const snapshotLocalPlaylists = jest.fn();
const snapshotStarredPlaylists = jest.fn();
const snapshotPlugins = jest.fn();
const getOrder = jest.fn();
const listPlatforms = jest.fn();
const snapshotMediaMeta = jest.fn();
const configGet = jest.fn();
const configGetStored = jest.fn();
const configIsValid = jest.fn();

// 类型化 fake：satisfies BackupDeps 锁住端口契约（未用到的 restore/set/subscribe 也须在场）
const deps = {
    playlist: {
        snapshotLocalPlaylists,
        snapshotStarredPlaylists,
        restoreLocalPlaylists: jest.fn(),
        restoreStarredPlaylists: jest.fn(),
    },
    pluginManager: {
        snapshotPlugins,
        restorePlugins: jest.fn(),
        getOrder,
    },
    mediaMeta: {
        listPlatforms,
        snapshotMediaMeta,
        restoreMediaMeta: jest.fn(),
    },
    config: {
        get: configGet,
        getStored: configGetStored,
        set: jest.fn(),
        subscribe: jest.fn(),
        // 值域规则由 core/config 自己的用例覆盖；这里只需可控地开关校验结果
        isValid: <K extends ConfigKey>(
            key: K,
            value: unknown,
        ): value is ConfigSchema[K] => configIsValid(key, value) as boolean,
    },
} satisfies BackupDeps;

function makeBackup(): Backup {
    return new Backup(deps);
}

const emptyPlugins = { installed: [], subscriptions: [], alternatives: [] };

beforeEach(() => {
    jest.clearAllMocks();
    mockUnlink.mockResolvedValue(undefined);
    mockStat.mockResolvedValue({ size: 1024 } as Awaited<
        ReturnType<typeof stat>
    >);
    mockReadFile.mockResolvedValue('{}');
    mockCreateTextFileWriter.mockReturnValue(fakeWriter().writer);
    mockSaveToDownloads.mockResolvedValue('content://downloads/1');
    mockCreateWebdavStore.mockReturnValue(webdavStore);
    webdavStore.testConnection.mockResolvedValue(undefined);
    webdavStore.ensureDir.mockResolvedValue(undefined);
    webdavStore.writeFile.mockResolvedValue(undefined);
    webdavStore.moveFile.mockResolvedValue(undefined);
    webdavStore.remove.mockResolvedValue(undefined);
    webdavStore.getFileSize.mockResolvedValue(2048);
    webdavStore.readFile.mockResolvedValue('{}');
    snapshotLocalPlaylists.mockResolvedValue([]);
    snapshotStarredPlaylists.mockResolvedValue([]);
    snapshotPlugins.mockResolvedValue(emptyPlugins);
    getOrder.mockReturnValue([]);
    listPlatforms.mockImplementation(async (platforms: string[]) => platforms);
    snapshotMediaMeta.mockReturnValue([]);
    configGet.mockReturnValue(undefined);
    configIsValid.mockReturnValue(true);
    configGetStored.mockReturnValue(undefined);
});

describe('createBackup', () => {
    it('组装完整信封：format / version / origin + 全段快照', async () => {
        snapshotLocalPlaylists.mockResolvedValue([
            { id: 'favorite', title: '我喜欢', musicList: [] },
        ]);
        snapshotStarredPlaylists.mockResolvedValue([
            { platform: 'p', id: 's' },
        ]);
        snapshotPlugins.mockResolvedValue({
            installed: [{ srcUrl: 'https://ex/a.js', enabled: true }],
            subscriptions: [],
            alternatives: [],
        });
        snapshotMediaMeta.mockReturnValue([
            { platform: 'p', id: 'm', lyricOffset: 1 },
        ]);
        configGetStored.mockImplementation((key: string) =>
            key === 'basic.autoUpdatePlugin' ? true : undefined,
        );

        const env = await makeBackup().createBackup();

        expect(env.format).toBe('musicfree-backup');
        expect(env.version).toBe(2);
        expect(typeof env.createdAt).toBe('number');
        expect(env.origin).toEqual({
            platform: 'android',
            appVersion: '1.2.3',
            installationId: 'install-xyz',
        });
        expect(env.sections.musicSheets).toEqual([
            { id: 'favorite', title: '我喜欢', musicList: [] },
        ]);
        expect(env.sections.starredPlaylists).toEqual([
            { platform: 'p', id: 's' },
        ]);
        expect(env.sections.plugins).toEqual({
            installed: [{ srcUrl: 'https://ex/a.js', enabled: true }],
            subscriptions: [],
            alternatives: [],
        });
        expect(env.sections.mediaMeta).toEqual([
            { platform: 'p', id: 'm', lyricOffset: 1 },
        ]);
        expect(env.sections.settings).toEqual({
            values: { 'basic.autoUpdatePlugin': true },
        });
    });

    it('段选择：只导出选中段，其余缺段（undefined），未选段不取快照', async () => {
        const env = await makeBackup().createBackup(['plugins']);

        expect(env.sections.plugins).toEqual(emptyPlugins);
        expect(env.sections.musicSheets).toBeUndefined();
        expect(env.sections.starredPlaylists).toBeUndefined();
        expect(env.sections.mediaMeta).toBeUndefined();
        expect(env.sections.settings).toBeUndefined();
        // 未选段一律不取快照
        expect(snapshotLocalPlaylists).not.toHaveBeenCalled();
        expect(snapshotStarredPlaylists).not.toHaveBeenCalled();
        expect(snapshotMediaMeta).not.toHaveBeenCalled();
        expect(getOrder).not.toHaveBeenCalled();
        expect(configGetStored).not.toHaveBeenCalled();
    });

    it('选中但为空的段仍写出（段存在 = 权威空集）', async () => {
        const env = await makeBackup().createBackup(['starredPlaylists']);

        expect(env.sections.starredPlaylists).toEqual([]);
    });

    it('mediaMeta 平台集合合并历史目录，不仅限于已装插件', async () => {
        getOrder.mockReturnValue(['p1', 'p2']);
        listPlatforms.mockResolvedValueOnce([
            'p1',
            'p2',
            '本地',
            'uninstalled',
        ]);

        await makeBackup().createBackup(['mediaMeta']);

        expect(listPlatforms).toHaveBeenCalledWith(['p1', 'p2', '本地']);
        expect(snapshotMediaMeta).toHaveBeenCalledWith([
            'p1',
            'p2',
            '本地',
            'uninstalled',
        ]);
    });

    it('settings 白名单：只备份用户显式设过的白名单键，排除项从不读取', async () => {
        const set: Record<string, unknown> = {
            'basic.autoUpdatePlugin': true,
            'musicDetail.defaultView': 'lyric',
            'lyric.autoSearchLyric': true,
            'lyric.fontSize': 'large',
            'floatingLyric.enabled': true,
        };
        configGetStored.mockImplementation((key: string) => set[key]);

        const env = await makeBackup().createBackup(['settings']);

        // 只纳入白名单内、用户显式设过（getStored 有键）的项；未设的（其余白名单键）略过
        expect(env.sections.settings?.values).toEqual(set);
        // 排除项（密钥 / 设备绑定）一律不读取（不在白名单）
        for (const excluded of [
            'plugin.subscribeUrl',
            'floatingLyric.desktop.positionY',
            'floatingLyric.statusBar.positionY',
            'audioEffect.eqGains',
            'audioEffect.eqPreset',
        ]) {
            expect(configGetStored).not.toHaveBeenCalledWith(excluded);
        }
    });

    it('某选中段快照失败 → createBackup 抛出、后续段不再取快照', async () => {
        snapshotLocalPlaylists.mockRejectedValue(new Error('degraded'));

        await expect(makeBackup().createBackup()).rejects.toThrow('degraded');
        expect(snapshotStarredPlaylists).not.toHaveBeenCalled();
        expect(snapshotMediaMeta).not.toHaveBeenCalled();
    });

    it('仅 mediaMeta 但插件未就绪 / 对账失败 → 就绪屏障抛出、不产残缺 mediaMeta', async () => {
        snapshotPlugins.mockRejectedValue(new Error('插件注册表未就绪'));

        await expect(
            makeBackup().createBackup(['mediaMeta']),
        ).rejects.toThrow();
        // 屏障先抛：平台集合与 mediaMeta 快照都不该发生
        expect(getOrder).not.toHaveBeenCalled();
        expect(snapshotMediaMeta).not.toHaveBeenCalled();
    });
});

describe('createBackupFile', () => {
    it('写出的文本与同一次信封逐字段一致，落在私有缓存目录', async () => {
        jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
        const fake = fakeWriter();
        mockCreateTextFileWriter.mockReturnValue(fake.writer);
        snapshotStarredPlaylists.mockResolvedValue([
            { platform: 'p', id: 's1', title: '收藏' },
        ]);

        const file = await makeBackup().createBackupFile(['starredPlaylists']);

        expect(file.path).toBe(mockCreateTextFileWriter.mock.calls[0]![0]);
        expect(file.path.startsWith(`${CachesDirectoryPath}/`)).toBe(true);
        // 用 toEqual 锁全量：漏字段或多出未选段都要失败
        expect(JSON.parse(fake.text())).toEqual({
            format: 'musicfree-backup',
            version: 2,
            createdAt: 1700000000000,
            origin: {
                platform: 'android',
                appVersion: '1.2.3',
                installationId: 'install-xyz',
            },
            sections: {
                starredPlaylists: [{ platform: 'p', id: 's1', title: '收藏' }],
            },
        });
    });

    it('两次导出的临时路径不同，同毫秒也不会撞名', async () => {
        jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
        const backup = makeBackup();

        await backup.createBackupFile();
        await backup.createBackupFile();

        const [first, second] = mockCreateTextFileWriter.mock.calls;
        expect(first![0]).not.toBe(second![0]);
    });

    it('字节数取自写入器，恰好抵到互通区间上界不算超出', async () => {
        const fake = fakeWriter();
        fake.setBytes(64 * 1024 * 1024);
        mockCreateTextFileWriter.mockReturnValue(fake.writer);

        await expect(makeBackup().createBackupFile()).resolves.toMatchObject({
            sizeBytes: 64 * 1024 * 1024,
            exceedsInteropGuarantee: false,
        });
    });

    it('体积超出互通保证区间时置标记但仍产出文件', async () => {
        const fake = fakeWriter();
        fake.setBytes(64 * 1024 * 1024 + 1);
        mockCreateTextFileWriter.mockReturnValue(fake.writer);

        const file = await makeBackup().createBackupFile();

        expect(file.exceedsInteropGuarantee).toBe(true);
        expect(mockUnlink).not.toHaveBeenCalled();
    });

    it.each([
        ['恰好 10 万曲仍在区间内', 100_000, false],
        ['超过 10 万曲即超出区间', 100_001, true],
    ])('%s', async (_name, total, expected) => {
        snapshotLocalPlaylists.mockResolvedValue([
            {
                id: 'favorite',
                title: 'F',
                musicList: Array.from({ length: total }, (_unused, i) => ({
                    platform: 'p',
                    id: `m${i}`,
                })),
            },
        ]);

        const file = await makeBackup().createBackupFile(['musicSheets']);

        expect(file.exceedsInteropGuarantee).toBe(expected);
    });

    it('写入失败：清理半成品并抛出原始错误', async () => {
        mockCreateTextFileWriter.mockReturnValue({
            write: () => Promise.reject(new Error('磁盘已满')),
            close: () => Promise.resolve(0),
        });

        await expect(makeBackup().createBackupFile()).rejects.toThrow(
            '磁盘已满',
        );
        expect(mockUnlink).toHaveBeenCalledWith(
            mockCreateTextFileWriter.mock.calls[0]![0],
        );
    });

    it('收尾失败（内容已部分落盘）同样清理并抛出', async () => {
        mockCreateTextFileWriter.mockReturnValue({
            write: () => Promise.resolve(),
            close: () => Promise.reject(new Error('设备已拔出')),
        });

        await expect(makeBackup().createBackupFile()).rejects.toThrow(
            '设备已拔出',
        );
        expect(mockUnlink).toHaveBeenCalledWith(
            mockCreateTextFileWriter.mock.calls[0]![0],
        );
    });

    it('清理失败不掩盖原始错误', async () => {
        mockCreateTextFileWriter.mockReturnValue({
            write: () => Promise.reject(new Error('磁盘已满')),
            close: () => Promise.resolve(0),
        });
        mockUnlink.mockRejectedValue(new Error('文件不存在'));

        await expect(makeBackup().createBackupFile()).rejects.toThrow(
            '磁盘已满',
        );
    });

    it('快照阶段就失败则不开文件，也无从清理', async () => {
        snapshotLocalPlaylists.mockRejectedValue(new Error('存储降级'));

        await expect(makeBackup().createBackupFile()).rejects.toThrow(
            '存储降级',
        );
        expect(mockCreateTextFileWriter).not.toHaveBeenCalled();
        expect(mockUnlink).not.toHaveBeenCalled();
    });
});

describe('parseBackupFile', () => {
    const validBackup = JSON.stringify({
        format: 'musicfree-backup',
        version: 2,
        sections: { musicSheets: [] },
    });

    it('剥掉 file:// 与百分号编码后再读', async () => {
        mockReadFile.mockResolvedValue(validBackup);

        await makeBackup().parseBackupFile(
            'file:///caches/%E5%A4%87%E4%BB%BD.json',
        );

        expect(mockStat).toHaveBeenCalledWith('/caches/备份.json');
        expect(mockReadFile).toHaveBeenCalledWith('/caches/备份.json', 1024);
    });

    it('裸路径原样使用', async () => {
        mockReadFile.mockResolvedValue(validBackup);

        await makeBackup().parseBackupFile('/caches/a.json');

        expect(mockStat).toHaveBeenCalledWith('/caches/a.json');
    });

    it('先查大小：超限直接拒绝，绝不读入', async () => {
        mockStat.mockResolvedValue({ size: 64 * 1024 * 1024 + 1 } as Awaited<
            ReturnType<typeof stat>
        >);

        await expect(
            makeBackup().parseBackupFile('/caches/huge.json'),
        ).resolves.toEqual({
            ok: false,
            reason: 'tooLarge',
            sizeBytes: 64 * 1024 * 1024 + 1,
        });
        expect(mockReadFile).not.toHaveBeenCalled();
    });

    it('恰好抵到上限仍然读入', async () => {
        mockStat.mockResolvedValue({ size: 64 * 1024 * 1024 } as Awaited<
            ReturnType<typeof stat>
        >);
        mockReadFile.mockResolvedValue(validBackup);

        await expect(
            makeBackup().parseBackupFile('/caches/big.json'),
        ).resolves.toMatchObject({ ok: true });
        expect(mockReadFile).toHaveBeenCalled();
    });

    it('容忍别的端写出的前导 BOM', async () => {
        mockReadFile.mockResolvedValue(`\uFEFF${validBackup}`);

        await expect(
            makeBackup().parseBackupFile('/caches/a.json'),
        ).resolves.toMatchObject({ ok: true });
    });

    it('查大小失败即向上抛，不去读文件', async () => {
        mockStat.mockRejectedValue(new Error('文件不存在'));

        await expect(
            makeBackup().parseBackupFile('/caches/gone.json'),
        ).rejects.toThrow('文件不存在');
        expect(mockReadFile).not.toHaveBeenCalled();
    });

    it('内容不是备份时如实汇报，不与过大混为一谈', async () => {
        mockReadFile.mockResolvedValue('{"hello":1}');

        await expect(
            makeBackup().parseBackupFile('/caches/a.json'),
        ).resolves.toEqual({ ok: false, reason: 'notBackup' });
    });

    it('读文件失败向上抛，不伪装成解析失败', async () => {
        mockReadFile.mockRejectedValue(new Error('文件已被删除'));

        await expect(
            makeBackup().parseBackupFile('/caches/a.json'),
        ).rejects.toThrow('文件已被删除');
    });
});

describe('exportBackupToDownloads', () => {
    it('交付临时文件并按协议命名，随后清掉临时文件', async () => {
        jest.useFakeTimers().setSystemTime(new Date(2026, 0, 2, 3, 4));

        const result = await makeBackup().exportBackupToDownloads();

        const [sourcePath, fileName, mimeType] =
            mockSaveToDownloads.mock.calls[0]!;
        expect(sourcePath).toBe(mockCreateTextFileWriter.mock.calls[0]![0]);
        expect(fileName).toBe('MusicFreeBackup_20260102_0304.json');
        expect(mimeType).toBe('application/json');
        expect(result.location).toBe('content://downloads/1');
        expect(mockUnlink).toHaveBeenCalledWith(sourcePath);

        jest.useRealTimers();
    });

    it('交付失败也清掉临时文件并抛出', async () => {
        mockSaveToDownloads.mockRejectedValue(new Error('存储空间不足'));

        await expect(makeBackup().exportBackupToDownloads()).rejects.toThrow(
            '存储空间不足',
        );
        expect(mockUnlink).toHaveBeenCalledWith(
            mockCreateTextFileWriter.mock.calls[0]![0],
        );
    });

    it('临时文件删不掉不影响已成功的交付', async () => {
        mockUnlink.mockRejectedValue(new Error('文件被占用'));

        await expect(
            makeBackup().exportBackupToDownloads(),
        ).resolves.toMatchObject({ location: 'content://downloads/1' });
    });

    it('交付失败且清理也失败时，暴露的仍是交付错误', async () => {
        mockSaveToDownloads.mockRejectedValue(new Error('存储空间不足'));
        mockUnlink.mockRejectedValue(new Error('文件被占用'));

        await expect(makeBackup().exportBackupToDownloads()).rejects.toThrow(
            '存储空间不足',
        );
    });

    it('互通超限标记透传给调用方', async () => {
        const fake = fakeWriter();
        fake.setBytes(64 * 1024 * 1024 + 1);
        mockCreateTextFileWriter.mockReturnValue(fake.writer);

        await expect(
            makeBackup().exportBackupToDownloads(),
        ).resolves.toMatchObject({
            sizeBytes: 64 * 1024 * 1024 + 1,
            exceedsInteropGuarantee: true,
        });
    });

    it('写文件阶段失败则不交付，且临时文件只被清理一次', async () => {
        mockCreateTextFileWriter.mockReturnValue({
            write: () => Promise.reject(new Error('磁盘已满')),
            close: () => Promise.resolve(0),
        });

        await expect(makeBackup().exportBackupToDownloads()).rejects.toThrow(
            '磁盘已满',
        );
        expect(mockSaveToDownloads).not.toHaveBeenCalled();
        expect(mockUnlink).toHaveBeenCalledTimes(1);
    });
});

describe('parseBackup', () => {
    const parse = (value: unknown) =>
        makeBackup().parseBackup(JSON.stringify(value));

    it('v2：识别 + 归一各段 + origin', () => {
        const result = parse({
            format: 'musicfree-backup',
            version: 2,
            createdAt: 1,
            origin: {
                platform: 'android',
                appVersion: '1.0.0',
                installationId: 'iid',
            },
            sections: {
                musicSheets: [
                    { id: 'favorite', title: '我喜欢', musicList: [] },
                ],
                starredPlaylists: [{ platform: 'p', id: 's' }],
                plugins: {
                    installed: [{ srcUrl: 'https://ex/a.js', enabled: true }],
                    subscriptions: [],
                    alternatives: [],
                },
                mediaMeta: [{ platform: 'p', id: 'm', lyricOffset: 1 }],
                settings: { values: { 'lyric.fontSize': 'large' } },
            },
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.formatVariant).toBe('v2');
        expect(result.createdAt).toBe(1);
        expect(result.origin).toEqual({
            platform: 'android',
            appVersion: '1.0.0',
            installationId: 'iid',
        });
        expect(result.sections.musicSheets).toEqual([
            { id: 'favorite', title: '我喜欢', musicList: [] },
        ]);
        expect(result.sections.starredPlaylists).toEqual([
            { platform: 'p', id: 's' },
        ]);
        expect(result.sections.plugins).toEqual({
            installed: [{ srcUrl: 'https://ex/a.js', enabled: true }],
            subscriptions: [],
            alternatives: [],
        });
        expect(result.sections.mediaMeta).toEqual([
            { platform: 'p', id: 'm', lyricOffset: 1 },
        ]);
        expect(result.sections.settings).toEqual({
            values: { 'lyric.fontSize': 'large' },
        });
    });

    it('非 JSON / 非对象 → corrupt', () => {
        const b = makeBackup();
        expect(b.parseBackup('not json{')).toEqual({
            ok: false,
            reason: 'corrupt',
        });
        expect(b.parseBackup('123')).toEqual({ ok: false, reason: 'corrupt' });
        expect(b.parseBackup('null')).toEqual({ ok: false, reason: 'corrupt' });
        expect(b.parseBackup('[1,2]')).toEqual({
            ok: false,
            reason: 'corrupt',
        });
    });

    it('无法识别的对象 → notBackup', () => {
        expect(parse({ foo: 1 })).toEqual({ ok: false, reason: 'notBackup' });
        expect(parse({ format: 'other', version: 2 })).toEqual({
            ok: false,
            reason: 'notBackup',
        });
    });

    it('legacy 手机（无 version + 顶层 musicSheets / plugins）', () => {
        const result = parse({
            musicSheets: [{ id: 'favorite', title: '我喜欢', musicList: [] }],
            plugins: [{ srcUrl: 'https://ex/a.js', version: '1.0.0' }],
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.formatVariant).toBe('legacyMobile');
        expect(result.origin).toBeUndefined();
        expect(result.sections.musicSheets).toEqual([
            { id: 'favorite', title: '我喜欢', musicList: [] },
        ]);
        // legacy 无 enabled → 默认 true
        expect(result.sections.plugins).toEqual({
            installed: [
                { srcUrl: 'https://ex/a.js', version: '1.0.0', enabled: true },
            ],
            subscriptions: [],
            alternatives: [],
        });
    });

    it('桌面 v1（version===1 + 顶层 musicSheets）', () => {
        const result = parse({
            version: 1,
            createdAt: 1,
            musicSheets: [{ id: 'favorite', title: 'F', musicList: [] }],
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.formatVariant).toBe('desktopV1');
        expect(result.sections.musicSheets).toEqual([
            { id: 'favorite', title: 'F', musicList: [] },
        ]);
        expect(result.sections.plugins).toBeUndefined();
    });

    it('future（version>2）：尽力读已知段、忽略未知段', () => {
        const result = parse({
            format: 'musicfree-backup',
            version: 3,
            createdAt: 1,
            origin: {
                platform: 'android',
                appVersion: '9',
                installationId: 'x',
            },
            sections: {
                starredPlaylists: [{ platform: 'p', id: 's' }],
                unknownSection: [1, 2],
            },
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.formatVariant).toBe('future');
        expect(result.sections.starredPlaylists).toEqual([
            { platform: 'p', id: 's' },
        ]);
    });

    it('v2 musicSheets 非恰一个 favorite → 丢该段，其余段保留', () => {
        const result = parse({
            format: 'musicfree-backup',
            version: 2,
            createdAt: 1,
            origin: {
                platform: 'android',
                appVersion: '1',
                installationId: 'x',
            },
            sections: {
                musicSheets: [{ id: 'a', title: 'A', musicList: [] }], // 0 favorite
                starredPlaylists: [{ platform: 'p', id: 's' }],
            },
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.sections.musicSheets).toBeUndefined();
        expect(result.sections.starredPlaylists).toEqual([
            { platform: 'p', id: 's' },
        ]);
    });

    it('legacy favorite 取首现（多个同 id favorite 去重）', () => {
        const result = parse({
            musicSheets: [
                { id: 'favorite', title: '第一个', musicList: [] },
                { id: 'favorite', title: '第二个', musicList: [] },
            ],
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.sections.musicSheets).toEqual([
            { id: 'favorite', title: '第一个', musicList: [] },
        ]);
    });

    it('settings 平台门控：origin.platform 与本机不符 → 丢 settings', () => {
        const result = parse({
            format: 'musicfree-backup',
            version: 2,
            createdAt: 1,
            origin: { platform: 'ios', appVersion: '1', installationId: 'x' }, // 本机 android
            sections: { settings: { values: { 'lyric.fontSize': 'large' } } },
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.sections.settings).toBeUndefined();
    });

    it('malformed 段 → 丢段、不整体拒绝', () => {
        const result = parse({
            format: 'musicfree-backup',
            version: 2,
            createdAt: 1,
            origin: {
                platform: 'android',
                appVersion: '1',
                installationId: 'x',
            },
            sections: {
                musicSheets: [{ id: 'favorite', title: 'F', musicList: [] }],
                plugins: 'not-an-object',
                mediaMeta: { not: 'array' },
            },
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.sections.musicSheets).toEqual([
            { id: 'favorite', title: 'F', musicList: [] },
        ]);
        expect(result.sections.plugins).toBeUndefined();
        expect(result.sections.mediaMeta).toBeUndefined();
    });

    it('plugins installed 补 enabled 默认、过滤无 srcUrl 项', () => {
        const result = parse({
            format: 'musicfree-backup',
            version: 2,
            createdAt: 1,
            origin: {
                platform: 'android',
                appVersion: '1',
                installationId: 'x',
            },
            sections: {
                plugins: {
                    installed: [
                        { srcUrl: 'https://ex/a.js' }, // 无 enabled → true
                        { srcUrl: 'https://ex/b.js', enabled: false },
                        { version: '1' }, // 无 srcUrl → 过滤
                    ],
                    subscriptions: [],
                    alternatives: [],
                },
            },
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.sections.plugins?.installed).toEqual([
            { srcUrl: 'https://ex/a.js', enabled: true },
            { srcUrl: 'https://ex/b.js', enabled: false },
        ]);
    });

    it('v2 两个 favorite → musicSheets 丢段（其余段保留）', () => {
        const result = parse({
            format: 'musicfree-backup',
            version: 2,
            createdAt: 1,
            origin: {
                platform: 'android',
                appVersion: '1',
                installationId: 'x',
            },
            sections: {
                musicSheets: [
                    { id: 'favorite', title: 'F1', musicList: [] },
                    { id: 'favorite', title: 'F2', musicList: [] },
                ],
                starredPlaylists: [{ platform: 'p', id: 's' }],
            },
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.sections.musicSheets).toBeUndefined();
        expect(result.sections.starredPlaylists).toEqual([
            { platform: 'p', id: 's' },
        ]);
    });

    it('legacy 零 favorite → musicSheets 丢段（恢复不动目标端 favorite）', () => {
        const result = parse({
            musicSheets: [{ id: 'a', title: 'A', musicList: [] }],
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.formatVariant).toBe('legacyMobile');
        expect(result.sections.musicSheets).toBeUndefined();
    });

    it('malformed version（字符串 / 非整数）→ notBackup', () => {
        expect(
            parse({ format: 'musicfree-backup', version: '2', createdAt: 1 }),
        ).toEqual({ ok: false, reason: 'notBackup' });
        expect(
            parse({ format: 'musicfree-backup', version: 2.5, createdAt: 1 }),
        ).toEqual({ ok: false, reason: 'notBackup' });
    });

    it('已识别 v2 但 sections 缺失 / 非对象 → corrupt', () => {
        expect(
            parse({ format: 'musicfree-backup', version: 2, createdAt: 1 }),
        ).toEqual({ ok: false, reason: 'corrupt' });
        expect(
            parse({
                format: 'musicfree-backup',
                version: 2,
                createdAt: 1,
                sections: [1],
            }),
        ).toEqual({ ok: false, reason: 'corrupt' });
    });

    it('createdAt：desktop v1 保留、legacy 缺失为 undefined', () => {
        const d = parse({
            version: 1,
            createdAt: 42,
            musicSheets: [{ id: 'favorite', title: 'F', musicList: [] }],
        });
        expect(d.ok && d.createdAt).toBe(42);
        const l = parse({
            musicSheets: [{ id: 'favorite', title: 'F', musicList: [] }],
        });
        expect(l.ok && l.createdAt).toBeUndefined();
    });

    it('歌单元数据校验：非法 title / createdAt / sortMode 回落或省略（避免写坏存储）', () => {
        const result = parse({
            format: 'musicfree-backup',
            version: 2,
            createdAt: 1,
            origin: {
                platform: 'android',
                appVersion: '1',
                installationId: 'x',
            },
            sections: {
                musicSheets: [
                    {
                        id: 'favorite',
                        title: 123,
                        createdAt: 'nope',
                        sortMode: 'bogus',
                        musicList: [],
                    },
                ],
            },
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        // title 非字符串 → ''、createdAt 非数字 → 省略、sortMode 非法 → 省略
        expect(result.sections.musicSheets).toEqual([
            { id: 'favorite', title: '', musicList: [] },
        ]);
    });

    it.each([
        'manual',
        'title',
        'titleDesc',
        'artist',
        'artistDesc',
        'album',
        'albumDesc',
        'addedAt',
        'addedAtDesc',
    ])('canonical sortMode %s 原样通过', mode => {
        const result = parse({
            musicSheets: [
                { id: 'favorite', title: 'F', musicList: [], sortMode: mode },
            ],
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.sections.musicSheets).toEqual([
            { id: 'favorite', title: 'F', musicList: [], sortMode: mode },
        ]);
    });

    it.each(['toString', 'constructor', '__proto__'])(
        '原型链属性 %s 不是合法 sortMode',
        mode => {
            const result = parse({
                musicSheets: [
                    {
                        id: 'favorite',
                        title: 'F',
                        musicList: [],
                        sortMode: mode,
                    },
                ],
            });

            expect(result.ok).toBe(true);
            if (!result.ok) {
                return;
            }
            expect(result.sections.musicSheets).toEqual([
                { id: 'favorite', title: 'F', musicList: [] },
            ]);
        },
    );

    it('legacy sortMode time / time-rev → addedAtDesc / addedAt', () => {
        const result = parse({
            musicSheets: [
                { id: 'favorite', title: 'F', musicList: [], sortMode: 'time' },
                { id: 'a', title: 'A', musicList: [], sortMode: 'time-rev' },
            ],
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.sections.musicSheets).toEqual([
            {
                id: 'favorite',
                title: 'F',
                musicList: [],
                sortMode: 'addedAtDesc',
            },
            { id: 'a', title: 'A', musicList: [], sortMode: 'addedAt' },
        ]);
    });

    it('plugins 非 http(s) srcUrl / 订阅 url → 过滤（安全边界）', () => {
        const result = parse({
            format: 'musicfree-backup',
            version: 2,
            createdAt: 1,
            origin: {
                platform: 'android',
                appVersion: '1',
                installationId: 'x',
            },
            sections: {
                plugins: {
                    installed: [
                        { srcUrl: 'https://ex/a.js', enabled: true },
                        { srcUrl: 'file:///evil.js', enabled: true },
                        { srcUrl: 'ftp://x/a.js', enabled: true },
                    ],
                    subscriptions: [
                        { name: 'ok', url: 'https://ex/s.json' },
                        { name: 'bad', url: 'file:///s.json' },
                    ],
                    alternatives: [],
                },
            },
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.sections.plugins).toEqual({
            installed: [{ srcUrl: 'https://ex/a.js', enabled: true }],
            subscriptions: [{ name: 'ok', url: 'https://ex/s.json' }],
            alternatives: [],
        });
    });

    it('starred 数字 id → 读侧转字符串（canonical id 契约）', () => {
        const result = parse({
            format: 'musicfree-backup',
            version: 2,
            createdAt: 1,
            origin: {
                platform: 'android',
                appVersion: '1',
                installationId: 'x',
            },
            sections: { starredPlaylists: [{ platform: 'p', id: 123 }] },
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.sections.starredPlaylists).toEqual([
            { platform: 'p', id: '123' },
        ]);
    });

    it('musicList / starred 项非字符串 artwork → 删除（避免下游 .trim() 崩溃）', () => {
        const result = parse({
            format: 'musicfree-backup',
            version: 2,
            createdAt: 1,
            origin: {
                platform: 'android',
                appVersion: '1',
                installationId: 'x',
            },
            sections: {
                musicSheets: [
                    {
                        id: 'favorite',
                        title: 'F',
                        musicList: [
                            {
                                platform: 'p',
                                id: 'a',
                                title: 't',
                                artwork: 123,
                            },
                        ],
                    },
                ],
                starredPlaylists: [{ platform: 'p', id: 's', artwork: 456 }],
            },
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.sections.musicSheets).toEqual([
            {
                id: 'favorite',
                title: 'F',
                musicList: [{ platform: 'p', id: 'a', title: 't' }],
            },
        ]);
        expect(result.sections.starredPlaylists).toEqual([
            { platform: 'p', id: 's' },
        ]);
    });

    it('废弃 coverImg → artwork（仅 artwork 缺失时补，移除别名）', () => {
        const result = parse({
            format: 'musicfree-backup',
            version: 2,
            createdAt: 1,
            origin: {
                platform: 'android',
                appVersion: '1',
                installationId: 'x',
            },
            sections: {
                starredPlaylists: [
                    { platform: 'p', id: 's1', coverImg: 'https://ex/c.jpg' },
                    {
                        platform: 'p',
                        id: 's2',
                        artwork: 'https://ex/a.jpg',
                        coverImg: 'https://ex/c.jpg',
                    },
                ],
            },
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.sections.starredPlaylists).toEqual([
            { platform: 'p', id: 's1', artwork: 'https://ex/c.jpg' },
            { platform: 'p', id: 's2', artwork: 'https://ex/a.jpg' },
        ]);
    });

    it('v2「一真一坏」两个 favorite（一个结构损坏）→ 仍按 id 计数丢段', () => {
        const result = parse({
            format: 'musicfree-backup',
            version: 2,
            createdAt: 1,
            origin: {
                platform: 'android',
                appVersion: '1',
                installationId: 'x',
            },
            sections: {
                musicSheets: [
                    { id: 'favorite', title: 'F', musicList: [] },
                    { id: 'favorite', musicList: 'broken' }, // 结构损坏（musicList 非数组）
                ],
                starredPlaylists: [{ platform: 'p', id: 's' }],
            },
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.sections.musicSheets).toBeUndefined();
        expect(result.sections.starredPlaylists).toEqual([
            { platform: 'p', id: 's' },
        ]);
    });

    it('starred 内嵌 musicList 逐项归一（非字符串 artwork / 错误 duration 删）', () => {
        const result = parse({
            format: 'musicfree-backup',
            version: 2,
            createdAt: 1,
            origin: {
                platform: 'android',
                appVersion: '1',
                installationId: 'x',
            },
            sections: {
                starredPlaylists: [
                    {
                        platform: 'p',
                        id: 's',
                        musicList: [
                            {
                                platform: 'p',
                                id: 't',
                                artwork: 123,
                                duration: '99',
                            },
                        ],
                    },
                ],
            },
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.sections.starredPlaylists).toEqual([
            { platform: 'p', id: 's', musicList: [{ platform: 'p', id: 't' }] },
        ]);
    });

    it('musicList 项 duration 非有限数删、有限数保留', () => {
        const result = parse({
            format: 'musicfree-backup',
            version: 2,
            createdAt: 1,
            origin: {
                platform: 'android',
                appVersion: '1',
                installationId: 'x',
            },
            sections: {
                musicSheets: [
                    {
                        id: 'favorite',
                        title: 'F',
                        musicList: [
                            { platform: 'p', id: 'a', duration: 180 },
                            { platform: 'p', id: 'b', duration: 'nope' },
                        ],
                    },
                ],
            },
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.sections.musicSheets).toEqual([
            {
                id: 'favorite',
                title: 'F',
                musicList: [
                    { platform: 'p', id: 'a', duration: 180 },
                    { platform: 'p', id: 'b' },
                ],
            },
        ]);
    });

    it('mediaMeta 关联歌词 musicItem 身份非法 → 丢 associatedLyric、保留 lyricOffset', () => {
        const result = parse({
            format: 'musicfree-backup',
            version: 2,
            createdAt: 1,
            origin: {
                platform: 'android',
                appVersion: '1',
                installationId: 'x',
            },
            sections: {
                mediaMeta: [
                    {
                        platform: 'p',
                        id: 'm1',
                        lyricOffset: 2,
                        associatedLyric: { musicItem: { artwork: 123 } }, // 缺 platform/id
                    },
                    {
                        platform: 'p',
                        id: 'm2',
                        associatedLyric: { musicItem: 'not-an-object' },
                    },
                    {
                        platform: 'p',
                        id: 'm3',
                        associatedLyric: {
                            musicItem: { platform: 'q', id: 456, artwork: 789 },
                        },
                    },
                ],
            },
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.sections.mediaMeta).toEqual([
            { platform: 'p', id: 'm1', lyricOffset: 2 },
            { platform: 'p', id: 'm2' },
            {
                platform: 'p',
                id: 'm3',
                associatedLyric: { musicItem: { platform: 'q', id: '456' } },
            },
        ]);
    });

    it('跨类型插件扩展字段保留（MusicItem 的 coverImg/description、歌单头的 album）', () => {
        const result = parse({
            format: 'musicfree-backup',
            version: 2,
            createdAt: 1,
            origin: {
                platform: 'android',
                appVersion: '1',
                installationId: 'x',
            },
            sections: {
                musicSheets: [
                    {
                        id: 'favorite',
                        title: 'F',
                        musicList: [
                            {
                                platform: 'p',
                                id: 'a',
                                coverImg: 'https://ex/c.jpg',
                                description: 'plugin desc',
                            },
                        ],
                    },
                ],
                starredPlaylists: [
                    { platform: 'p', id: 's', album: { nested: 1 } },
                ],
            },
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.sections.musicSheets).toEqual([
            {
                id: 'favorite',
                title: 'F',
                musicList: [
                    {
                        platform: 'p',
                        id: 'a',
                        coverImg: 'https://ex/c.jpg',
                        description: 'plugin desc',
                    },
                ],
            },
        ]);
        expect(result.sections.starredPlaylists).toEqual([
            { platform: 'p', id: 's', album: { nested: 1 } },
        ]);
    });

    it('starred 旧拼写 createAt → 补 canonical createdAt 且保留旧键', () => {
        const result = parse({
            format: 'musicfree-backup',
            version: 2,
            createdAt: 1,
            origin: {
                platform: 'android',
                appVersion: '1',
                installationId: 'x',
            },
            sections: {
                starredPlaylists: [
                    { platform: 'p', id: 's1', createAt: 111 },
                    { platform: 'p', id: 's2', createdAt: 222, createAt: 111 },
                ],
            },
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.sections.starredPlaylists).toEqual([
            { platform: 'p', id: 's1', createdAt: 111, createAt: 111 },
            { platform: 'p', id: 's2', createdAt: 222, createAt: 111 },
        ]);
    });

    it('starred 两个别名都非法 → 移除 createdAt（不把脏值当 canonical）', () => {
        const result = parse({
            format: 'musicfree-backup',
            version: 2,
            createdAt: 1,
            origin: {
                platform: 'android',
                appVersion: '1',
                installationId: 'x',
            },
            sections: {
                starredPlaylists: [
                    { platform: 'p', id: 's', createdAt: 'bad' },
                ],
            },
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.sections.starredPlaylists).toEqual([
            { platform: 'p', id: 's' },
        ]);
    });

    it('legacy 歌单旧拼写 createAt → canonical createdAt', () => {
        const legacy = parse({
            musicSheets: [
                { id: 'favorite', title: 'F', musicList: [], createAt: 111 },
            ],
        });
        expect(legacy.ok && legacy.sections.musicSheets).toEqual([
            { id: 'favorite', title: 'F', musicList: [], createdAt: 111 },
        ]);

        const desktopV1 = parse({
            version: 1,
            musicSheets: [
                { id: 'favorite', title: 'F', musicList: [], createAt: 222 },
            ],
        });
        expect(desktopV1.ok && desktopV1.sections.musicSheets).toEqual([
            { id: 'favorite', title: 'F', musicList: [], createdAt: 222 },
        ]);
    });
});

/** 构造 canonical sections 字面量（解析层已保证形状，此处直接断言用） */
function makeSections(value: unknown): BackupSections {
    return value as BackupSections;
}

describe('本地曲门控', () => {
    const crossDevice = makeSections({
        musicSheets: [
            {
                id: 'favorite',
                title: 'F',
                musicList: [
                    { platform: 'p', id: 'a' },
                    { platform: '本地', id: '/sd/x.mp3' },
                ],
            },
        ],
        starredPlaylists: [
            {
                platform: 'p',
                id: 's',
                musicList: [
                    { platform: '本地', id: '/sd/y.mp3' },
                    { platform: 'p', id: 'b' },
                ],
            },
        ],
        mediaMeta: [
            { platform: '本地', id: '/sd/z.mp3', lyricOffset: 1 },
            { platform: 'p', id: 'm', lyricOffset: 2 },
        ],
    });

    it('同一安装：原样返回、不拷贝、零忽略', () => {
        const result = gateLocalMedia(crossDevice, true);

        expect(result.localMediaIgnored).toBe(0);
        expect(result.sections).toBe(crossDevice);
    });

    it('跨设备：剔除歌单 / 收藏内嵌 / mediaMeta 里的本地曲并计数', () => {
        const { sections, localMediaIgnored } = gateLocalMedia(
            crossDevice,
            false,
        );

        expect(localMediaIgnored).toBe(3);
        expect(sections.musicSheets?.[0]!.musicList).toEqual([
            { platform: 'p', id: 'a' },
        ]);
        expect(sections.starredPlaylists?.[0]!.musicList).toEqual([
            { platform: 'p', id: 'b' },
        ]);
        expect(sections.mediaMeta).toEqual([
            { platform: 'p', id: 'm', lyricOffset: 2 },
        ]);
    });

    it('跨设备：关联歌词来源是本地曲 → 只摘 associatedLyric、保留 lyricOffset', () => {
        const { sections, localMediaIgnored } = gateLocalMedia(
            makeSections({
                mediaMeta: [
                    {
                        platform: 'p',
                        id: 'm',
                        lyricOffset: 5,
                        associatedLyric: {
                            musicItem: { platform: '本地', id: '/sd/s.mp3' },
                        },
                    },
                ],
            }),
            false,
        );

        expect(localMediaIgnored).toBe(1);
        expect(sections.mediaMeta).toEqual([
            { platform: 'p', id: 'm', lyricOffset: 5 },
        ]);
    });

    it('跨设备：缺段仍缺失，不凭空造出空段（避免 overwrite 误清）', () => {
        const { sections } = gateLocalMedia(makeSections({}), false);

        expect(sections.musicSheets).toBeUndefined();
        expect(sections.starredPlaylists).toBeUndefined();
        expect(sections.mediaMeta).toBeUndefined();
    });

    it('跨设备：关联来源本地且无 lyricOffset → 整条剔除，不留无纳入字段的空记录', () => {
        const { sections, localMediaIgnored } = gateLocalMedia(
            makeSections({
                mediaMeta: [
                    {
                        platform: 'p',
                        id: 'm',
                        associatedLyric: {
                            musicItem: { platform: '本地', id: '/sd/s.mp3' },
                        },
                    },
                ],
            }),
            false,
        );

        expect(localMediaIgnored).toBe(1);
        // 段存在但已空 —— 仍是 []，不能退化成缺段
        expect(sections.mediaMeta).toEqual([]);
    });

    it('跨设备：目标与关联来源都是本地 → 整条剔除并按引用计 2', () => {
        const { sections, localMediaIgnored } = gateLocalMedia(
            makeSections({
                mediaMeta: [
                    {
                        platform: '本地',
                        id: '/sd/a.mp3',
                        lyricOffset: 3,
                        associatedLyric: {
                            musicItem: { platform: '本地', id: '/sd/b.mp3' },
                        },
                    },
                ],
            }),
            false,
        );

        expect(localMediaIgnored).toBe(2);
        expect(sections.mediaMeta).toEqual([]);
    });

    it('跨设备过滤不改动输入对象', () => {
        const input = makeSections({
            mediaMeta: [{ platform: '本地', id: '/sd/a.mp3', lyricOffset: 1 }],
        });

        gateLocalMedia(input, false);

        expect(input.mediaMeta).toHaveLength(1);
    });
});

describe('恢复模式敏感段', () => {
    const localPort = { restoreLocalPlaylists: jest.fn() };
    const starredPort = { restoreStarredPlaylists: jest.fn() };
    const local = localPort as unknown as Parameters<
        typeof restoreMusicSheetsSection
    >[0];
    const starred = starredPort as unknown as Parameters<
        typeof restoreStarredPlaylistsSection
    >[0];

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('缺段 → skipped/absent，且完全不调端口', async () => {
        expect(
            await restoreMusicSheetsSection(local, undefined, 'overwrite'),
        ).toEqual({ status: 'skipped', reason: 'absent' });
        expect(
            await restoreStarredPlaylistsSection(
                starred,
                undefined,
                'overwrite',
            ),
        ).toEqual({ status: 'skipped', reason: 'absent' });
        expect(localPort.restoreLocalPlaylists).not.toHaveBeenCalled();
        expect(starredPort.restoreStarredPlaylists).not.toHaveBeenCalled();
    });

    it('空段仍下发端口（overwrite 下即清空语义），模式原样透传', async () => {
        starredPort.restoreStarredPlaylists.mockResolvedValue({
            starredAdded: 0,
            starredSkipped: 0,
        });

        const outcome = await restoreStarredPlaylistsSection(
            starred,
            [],
            'overwrite',
        );

        expect(outcome).toEqual({
            status: 'ok',
            counts: { starredAdded: 0, starredSkipped: 0 },
        });
        expect(starredPort.restoreStarredPlaylists).toHaveBeenCalledWith(
            [],
            'overwrite',
        );
    });

    it('成功 → ok + 端口计数原样带出', async () => {
        const counts = {
            localPlaylistsCreated: 2,
            musicAdded: 7,
            musicDuplicatesSkipped: 1,
            invalidMusicSkipped: 0,
        };
        localPort.restoreLocalPlaylists.mockResolvedValue(counts);

        const outcome = await restoreMusicSheetsSection(local, [], 'append');

        expect(outcome).toEqual({ status: 'ok', counts });
        expect(localPort.restoreLocalPlaylists).toHaveBeenCalledWith(
            [],
            'append',
        );
    });

    it('端口 reject 带稳定码 → failed 带 errorCode + message', async () => {
        const error = Object.assign(new Error('存储降级'), {
            code: 'STORAGE_DEGRADED',
        });
        localPort.restoreLocalPlaylists.mockRejectedValue(error);

        expect(await restoreMusicSheetsSection(local, [], 'append')).toEqual({
            status: 'failed',
            errorCode: 'STORAGE_DEGRADED',
            message: '存储降级',
        });
    });

    it('端口抛无码错误 → failed 仅带 message', async () => {
        starredPort.restoreStarredPlaylists.mockRejectedValue(
            new Error('磁盘写失败'),
        );

        expect(
            await restoreStarredPlaylistsSection(starred, [], 'append'),
        ).toEqual({
            status: 'failed',
            message: '磁盘写失败',
        });
    });
});

describe('restoreBackup 编排', () => {
    /** 组装 parseBackup 的成功结果；origin 省略即模拟 legacy / 桌面 v1 */
    function parsed(sections: unknown, installationId?: string): ParsedBackup {
        return {
            ok: true,
            formatVariant: 'v2',
            ...(installationId !== undefined
                ? {
                      origin: {
                          platform: 'android',
                          appVersion: '1',
                          installationId,
                      },
                  }
                : {}),
            sections,
        } as ParsedBackup;
    }

    beforeEach(() => {
        deps.playlist.restoreLocalPlaylists.mockResolvedValue({
            localPlaylistsCreated: 1,
            musicAdded: 2,
            musicDuplicatesSkipped: 0,
            invalidMusicSkipped: 0,
        });
        deps.playlist.restoreStarredPlaylists.mockResolvedValue({
            starredAdded: 1,
            starredSkipped: 0,
        });
        deps.pluginManager.restorePlugins.mockResolvedValue({
            pluginsInstalled: 1,
            pluginsSkipped: 0,
            pluginInstallFailures: [],
            subscriptionsAdded: 0,
            subscriptionsSkipped: 0,
            alternativesAdded: 0,
            alternativesSkipped: 0,
        });
        deps.mediaMeta.restoreMediaMeta.mockReturnValue({
            upserted: 1,
            skipped: 0,
        });
    });

    it('缺段 → absent，且完全不下发端口', async () => {
        const result = await makeBackup().restoreBackup(parsed({}), {
            mode: 'append',
        });

        for (const section of [
            result.musicSheets,
            result.starredPlaylists,
            result.plugins,
            result.mediaMeta,
            result.settings,
        ]) {
            expect(section).toEqual({ status: 'skipped', reason: 'absent' });
        }
        expect(deps.playlist.restoreLocalPlaylists).not.toHaveBeenCalled();
        expect(deps.playlist.restoreStarredPlaylists).not.toHaveBeenCalled();
        expect(deps.pluginManager.restorePlugins).not.toHaveBeenCalled();
        expect(deps.mediaMeta.restoreMediaMeta).not.toHaveBeenCalled();
    });

    it('段级选择：未选中的段 notSelected 且不下发端口', async () => {
        const result = await makeBackup().restoreBackup(
            parsed({
                musicSheets: [{ id: 'favorite', title: 'F', musicList: [] }],
                starredPlaylists: [{ platform: 'p', id: 's' }],
            }),
            { mode: 'append', selection: ['musicSheets'] },
        );

        expect(result.musicSheets.status).toBe('ok');
        expect(result.starredPlaylists).toEqual({
            status: 'skipped',
            reason: 'notSelected',
        });
        expect(deps.playlist.restoreStarredPlaylists).not.toHaveBeenCalled();
    });

    it('模式只透传给两个模式敏感段', async () => {
        await makeBackup().restoreBackup(
            parsed({
                musicSheets: [{ id: 'favorite', title: 'F', musicList: [] }],
                starredPlaylists: [],
                plugins: {
                    installed: [{ srcUrl: 'https://ex/a.js', enabled: true }],
                    subscriptions: [],
                    alternatives: [],
                },
            }),
            { mode: 'overwrite' },
        );

        expect(deps.playlist.restoreLocalPlaylists).toHaveBeenCalledWith(
            expect.anything(),
            'overwrite',
        );
        expect(deps.playlist.restoreStarredPlaylists).toHaveBeenCalledWith(
            [],
            'overwrite',
        );
        // 恒增量段只收内容、不看模式
        expect(deps.pluginManager.restorePlugins).toHaveBeenCalledWith({
            installed: [{ srcUrl: 'https://ex/a.js', enabled: true }],
            subscriptions: [],
            alternatives: [],
        });
    });

    it('plugins 空段 → 不下发端口（端口会等就绪 / 查对账，空段不该被它拖累）', async () => {
        deps.pluginManager.restorePlugins.mockRejectedValue(
            new Error('对账失败'),
        );

        const result = await makeBackup().restoreBackup(
            parsed({
                plugins: {
                    installed: [],
                    subscriptions: [],
                    alternatives: [],
                },
            }),
            { mode: 'overwrite' },
        );

        expect(result.plugins).toEqual({
            status: 'ok',
            counts: {
                pluginsInstalled: 0,
                pluginsSkipped: 0,
                pluginInstallFailures: [],
                subscriptionsAdded: 0,
                subscriptionsSkipped: 0,
                alternativesAdded: 0,
                alternativesSkipped: 0,
            },
        });
        expect(deps.pluginManager.restorePlugins).not.toHaveBeenCalled();
    });

    it('未选中的段不计入本地曲忽略数（门控只作用于选中段）', async () => {
        const result = await makeBackup().restoreBackup(
            parsed(
                {
                    musicSheets: [
                        {
                            id: 'favorite',
                            title: 'F',
                            musicList: [{ platform: '本地', id: '/sd/a.mp3' }],
                        },
                    ],
                    settings: { values: {} },
                },
                'other-install',
            ),
            { mode: 'append', selection: ['settings'] },
        );

        expect(result.localMediaIgnored).toBe(0);
        expect(result.musicSheets).toEqual({
            status: 'skipped',
            reason: 'notSelected',
        });
    });

    it('同一安装 → 本地曲原样恢复、零忽略', async () => {
        const result = await makeBackup().restoreBackup(
            parsed(
                {
                    musicSheets: [
                        {
                            id: 'favorite',
                            title: 'F',
                            musicList: [{ platform: '本地', id: '/sd/a.mp3' }],
                        },
                    ],
                },
                'install-xyz',
            ),
            { mode: 'append' },
        );

        expect(result.localMediaIgnored).toBe(0);
        expect(
            deps.playlist.restoreLocalPlaylists.mock.calls[0]![0][0].musicList,
        ).toEqual([{ platform: '本地', id: '/sd/a.mp3' }]);
    });

    it('跨设备（installationId 不同）→ 本地曲剔除并计数', async () => {
        const result = await makeBackup().restoreBackup(
            parsed(
                {
                    musicSheets: [
                        {
                            id: 'favorite',
                            title: 'F',
                            musicList: [
                                { platform: '本地', id: '/sd/a.mp3' },
                                { platform: 'p', id: 'x' },
                            ],
                        },
                    ],
                },
                'other-install',
            ),
            { mode: 'append' },
        );

        expect(result.localMediaIgnored).toBe(1);
        expect(
            deps.playlist.restoreLocalPlaylists.mock.calls[0]![0][0].musicList,
        ).toEqual([{ platform: 'p', id: 'x' }]);
    });

    it('legacy 无 origin → 按跨设备处理（fail-closed）', async () => {
        const result = await makeBackup().restoreBackup(
            parsed({
                musicSheets: [
                    {
                        id: 'favorite',
                        title: 'F',
                        musicList: [{ platform: '本地', id: '/sd/a.mp3' }],
                    },
                ],
            }),
            { mode: 'append' },
        );

        expect(result.localMediaIgnored).toBe(1);
    });

    it('某段失败不影响其余段（段间不回滚）', async () => {
        deps.playlist.restoreLocalPlaylists.mockRejectedValue(
            Object.assign(new Error('降级'), { code: 'STORAGE_DEGRADED' }),
        );

        const result = await makeBackup().restoreBackup(
            parsed({
                musicSheets: [{ id: 'favorite', title: 'F', musicList: [] }],
                starredPlaylists: [{ platform: 'p', id: 's' }],
            }),
            { mode: 'append' },
        );

        expect(result.musicSheets).toEqual({
            status: 'failed',
            errorCode: 'STORAGE_DEGRADED',
            message: '降级',
        });
        expect(result.starredPlaylists.status).toBe('ok');
        expect(deps.playlist.restoreStarredPlaylists).toHaveBeenCalled();
    });

    it('settings：白名单外的键、以及未通过值域校验的值，都跳过', async () => {
        // 只放行 lyric.fontSize，模拟其余值不合值域
        configIsValid.mockImplementation(
            (key: string) => key === 'lyric.fontSize',
        );

        const result = await makeBackup().restoreBackup(
            parsed({
                settings: {
                    values: {
                        'lyric.fontSize': 'large',
                        // 在白名单内但值域校验不过（如枚举外的值）
                        'basic.playQualityOrder': 'sideways',
                        // 不在白名单（密钥类，恒排除）——连校验都不该问
                        'plugin.subscribeUrl': 'https://ex/s.json',
                    },
                },
            }),
            { mode: 'append' },
        );

        expect(result.settings).toEqual({
            status: 'ok',
            counts: { applied: 1, skipped: 2 },
        });
        expect(deps.config.set).toHaveBeenCalledTimes(1);
        expect(deps.config.set).toHaveBeenCalledWith('lyric.fontSize', 'large');
        // 白名单外的键不该走到值域校验
        expect(configIsValid).not.toHaveBeenCalledWith(
            'plugin.subscribeUrl',
            expect.anything(),
        );
        // 校验的是「该键配该值」，而非只按 key 判定
        expect(configIsValid).toHaveBeenCalledTimes(2);
        expect(configIsValid).toHaveBeenCalledWith('lyric.fontSize', 'large');
        expect(configIsValid).toHaveBeenCalledWith(
            'basic.playQualityOrder',
            'sideways',
        );
    });

    it('缺 settings 段时完全不碰 config', async () => {
        const result = await makeBackup().restoreBackup(parsed({}), {
            mode: 'append',
        });

        expect(result.settings).toEqual({
            status: 'skipped',
            reason: 'absent',
        });
        expect(configIsValid).not.toHaveBeenCalled();
        expect(deps.config.set).not.toHaveBeenCalled();
        expect(configGet).not.toHaveBeenCalled();
        expect(configGetStored).not.toHaveBeenCalled();
        expect(deps.config.subscribe).not.toHaveBeenCalled();
    });

    it('mediaMeta 端口同步抛错 → 该段 failed，其后的 settings 段照常执行', async () => {
        deps.mediaMeta.restoreMediaMeta.mockImplementation(() => {
            throw new Error('MMKV 写失败');
        });

        const result = await makeBackup().restoreBackup(
            parsed({
                mediaMeta: [{ platform: 'p', id: 'm', lyricOffset: 1 }],
                settings: { values: { 'lyric.fontSize': 'large' } },
            }),
            { mode: 'append' },
        );

        expect(result.mediaMeta).toEqual({
            status: 'failed',
            message: 'MMKV 写失败',
        });
        expect(result.settings).toEqual({
            status: 'ok',
            counts: { applied: 1, skipped: 0 },
        });
    });

    it('段间严格串行：前一段未结束不会启动后一段', async () => {
        const order: string[] = [];
        // 用「端口已启动」信号做握手，不数微任务节拍（节拍数随实现层数变化、不可靠）
        let localStarted = (): void => {};
        let starredStarted = (): void => {};
        let releaseLocal = (): void => {};
        let releaseStarred = (): void => {};
        const onLocalStarted = new Promise<void>(resolve => {
            localStarted = resolve;
        });
        const onStarredStarted = new Promise<void>(resolve => {
            starredStarted = resolve;
        });
        const localGate = new Promise<void>(resolve => {
            releaseLocal = resolve;
        });
        const starredGate = new Promise<void>(resolve => {
            releaseStarred = resolve;
        });

        deps.playlist.restoreLocalPlaylists.mockImplementation(async () => {
            order.push('musicSheets:start');
            localStarted();
            await localGate;
            order.push('musicSheets:end');
            return {
                localPlaylistsCreated: 0,
                musicAdded: 0,
                musicDuplicatesSkipped: 0,
                invalidMusicSkipped: 0,
            };
        });
        deps.playlist.restoreStarredPlaylists.mockImplementation(async () => {
            order.push('starred:start');
            starredStarted();
            await starredGate;
            order.push('starred:end');
            return { starredAdded: 0, starredSkipped: 0 };
        });
        deps.pluginManager.restorePlugins.mockImplementation(async () => {
            order.push('plugins:start');
            return {
                pluginsInstalled: 0,
                pluginsSkipped: 0,
                pluginInstallFailures: [],
                subscriptionsAdded: 0,
                subscriptionsSkipped: 0,
                alternativesAdded: 0,
                alternativesSkipped: 0,
            };
        });

        const pending = makeBackup().restoreBackup(
            parsed({
                musicSheets: [{ id: 'favorite', title: 'F', musicList: [] }],
                starredPlaylists: [],
                // 必须非空：空插件段会被短路、不下发端口
                plugins: {
                    installed: [{ srcUrl: 'https://ex/a.js', enabled: true }],
                    subscriptions: [],
                    alternatives: [],
                },
            }),
            { mode: 'append' },
        );

        // 并发实现会在此刻已把后续段一并启动
        await onLocalStarted;
        expect(order).toEqual(['musicSheets:start']);

        releaseLocal();
        await onStarredStarted;
        // 协议允许插件段并行，故它最可能被单独提前启动——锁死它必须等收藏段结束
        expect(order).toEqual([
            'musicSheets:start',
            'musicSheets:end',
            'starred:start',
        ]);

        releaseStarred();
        await pending;
        expect(order).toEqual([
            'musicSheets:start',
            'musicSheets:end',
            'starred:start',
            'starred:end',
            'plugins:start',
        ]);
    });
});

describe('失败归类', () => {
    it.each([
        [401, 'unauthorized'],
        [403, 'forbidden'],
        [404, 'notFound'],
        [429, 'rateLimited'],
        [507, 'storageFull'],
        [405, 'unsupported'],
        [501, 'unsupported'],
    ])('HTTP %i 分类为 %s', (status, expected) => {
        expect(
            classifyBackupFailure(
                Object.assign(new Error('http failure'), { status }),
            ),
        ).toBe(expected);
    });

    it('诊断保留安全的方法状态摘要，不记录 URL、请求头或原始错误对象', () => {
        expect(
            describeBackupFailure(
                Object.assign(new Error('WebDAV GET: HTTP 401'), {
                    status: 401,
                }),
            ),
        ).toBe('WebDAV GET: HTTP 401');
        expect(
            describeBackupFailure(
                Object.assign(
                    new Error(
                        'https://user:secret@example.com/file?token=secret',
                    ),
                    { status: 500, method: 'GET' },
                ),
            ),
        ).toBe('GET: HTTP 500');
        expect(
            describeBackupFailure(
                Object.assign(new Error('private response'), {
                    status: 501,
                    method: 'secret-token',
                }),
            ),
        ).toBe('HTTP 501');
        expect(
            describeBackupFailure(
                Object.assign(new Error('private response'), {
                    status: Infinity,
                }),
            ),
        ).toBe('other');
        expect(
            describeBackupFailure(
                new Error('https://user:secret@example.com/file?token=secret'),
            ),
        ).toBe('other');
        expect(
            describeBackupFailure({ headers: { Authorization: 'secret' } }),
        ).toBe('other');
    });
    it.each([
        ['timeout' as const, 'timedOut'],
        ['cancelled' as const, 'cancelled'],
    ])('WebdavRequestError(%s) → %s', (kind, expected) => {
        expect(classifyBackupFailure(new WebdavRequestError(kind))).toBe(
            expected,
        );
    });

    it.each([
        [new Error('401 Unauthorized')],
        [new TypeError('Network request failed')],
        ['字符串也可能被抛出来'],
        [undefined],
    ])('其余一切都是 other（%p）', error => {
        expect(classifyBackupFailure(error)).toBe('other');
    });
});

describe('WebDAV 备份', () => {
    /** 让 config 返回一套可用凭据 */
    function configureWebdav(
        overrides: Partial<Record<ConfigKey, unknown>> = {},
    ): void {
        const values: Partial<Record<ConfigKey, unknown>> = {
            'webdav.url': 'https://ex/dav',
            'webdav.username': 'u',
            'webdav.password': 'p',
            ...overrides,
        };
        configGet.mockImplementation((key: ConfigKey) => values[key]);
    }

    it('未配置地址时不建连接、直接抛出', async () => {
        await expect(makeBackup().exportBackupToWebdav()).rejects.toThrow(
            'WebDAV',
        );
        expect(mockCreateWebdavStore).not.toHaveBeenCalled();
    });

    it('测试连接用传入的候选凭据，不读已存配置', async () => {
        // 让 config 里存着另一套，确保探测的确实是入参而非存量
        configureWebdav();

        await makeBackup().testWebdavConnection({
            url: 'https://candidate/dav',
            username: 'draft-user',
            password: 'draft-pass',
        });

        expect(mockCreateWebdavStore).toHaveBeenCalledWith(
            {
                url: 'https://candidate/dav',
                username: 'draft-user',
                password: 'draft-pass',
            },
            undefined,
        );
        expect(webdavStore.testConnection).toHaveBeenCalled();
    });

    it('测试连接不写 config：试一下不等于存下来', async () => {
        await makeBackup().testWebdavConnection({
            url: 'https://candidate/dav',
            username: 'u',
            password: 'p',
        });

        expect(deps.config.set).not.toHaveBeenCalled();
    });

    it('导出时用户名密码未设则按空串处理，不因此拒绝连接', async () => {
        configureWebdav({
            'webdav.username': undefined,
            'webdav.password': undefined,
        });

        await makeBackup().exportBackupToWebdav();

        expect(mockCreateWebdavStore).toHaveBeenCalledWith(
            {
                url: 'https://ex/dav',
                username: '',
                password: '',
            },
            undefined,
        );
    });

    it('完整快照就绪后建目录，直接写固定文件且不移动或删除', async () => {
        configureWebdav();

        const result = await makeBackup().exportBackupToWebdav([
            'starredPlaylists',
        ]);

        expect(webdavStore.ensureDir).toHaveBeenCalledWith('/MusicFree');
        const [path, text] = webdavStore.writeFile.mock.calls[0]!;
        expect(path).toBe('/MusicFree/MusicFreeBackup.json');
        expect(webdavStore.writeFile).toHaveBeenCalledTimes(1);
        expect(
            snapshotStarredPlaylists.mock.invocationCallOrder[0],
        ).toBeLessThan(webdavStore.ensureDir.mock.invocationCallOrder[0]!);
        expect(webdavStore.ensureDir.mock.invocationCallOrder[0]).toBeLessThan(
            webdavStore.writeFile.mock.invocationCallOrder[0]!,
        );
        expect(webdavStore.moveFile).not.toHaveBeenCalled();
        expect(webdavStore.remove).not.toHaveBeenCalled();
        // 上传的就是完整信封，且没绕道本地临时文件
        expect(JSON.parse(text as string)).toMatchObject({
            format: 'musicfree-backup',
            version: 2,
        });
        expect(mockCreateTextFileWriter).not.toHaveBeenCalled();
        expect(result.location).toBe('/MusicFree/MusicFreeBackup.json');
        // 字节数与结果里报的同源、只量一次：上传方拿它折算传输超时预算
        const [, , byteCount] = webdavStore.writeFile.mock.calls[0]!;
        expect(byteCount).toBe(result.sizeBytes);
    });

    it('字节数按 UTF-8 量而非 UTF-16 长度：中文歌单不许少算三倍', async () => {
        configureWebdav();
        // 数据必须带非 ASCII，否则 utf8ByteLength 与 text.length 相等，口径写错也测不出
        deps.playlist.snapshotStarredPlaylists.mockResolvedValue([
            { id: 's1', title: '我的收藏', platform: '本地', musicList: [] },
        ] as never);

        const result = await makeBackup().exportBackupToWebdav([
            'starredPlaylists',
        ]);

        const [, text, byteCount] = webdavStore.writeFile.mock.calls[0]!;
        expect(byteCount).toBe(result.sizeBytes);
        // 少算的后果：该弹的互通警告不弹，传输预算也按 1/3 折算
        expect(result.sizeBytes).toBeGreaterThan((text as string).length);
    });

    it('两次导出覆盖同一路径，正文使用各次完整快照', async () => {
        configureWebdav();
        const backup = makeBackup();
        snapshotStarredPlaylists
            .mockResolvedValueOnce([{ platform: 'demo', id: 'first' }])
            .mockResolvedValueOnce([{ platform: 'demo', id: 'second' }]);

        await backup.exportBackupToWebdav(['starredPlaylists']);
        await backup.exportBackupToWebdav(['starredPlaylists']);

        const [firstPath, firstText] = webdavStore.writeFile.mock.calls[0]!;
        const [secondPath, secondText] = webdavStore.writeFile.mock.calls[1]!;
        expect(firstPath).toBe('/MusicFree/MusicFreeBackup.json');
        expect(secondPath).toBe(firstPath);
        expect(JSON.parse(firstText).sections.starredPlaylists[0].id).toBe(
            'first',
        );
        expect(JSON.parse(secondText).sections.starredPlaylists[0].id).toBe(
            'second',
        );
        expect(webdavStore.moveFile).not.toHaveBeenCalled();
        expect(webdavStore.remove).not.toHaveBeenCalled();
    });

    it.each([
        ['网络失败', new Error('连接中断')],
        [
            'HTTP 错误',
            Object.assign(new Error('WebDAV PUT: HTTP 409'), { status: 409 }),
        ],
        ['用户取消', new WebdavRequestError('cancelled')],
        ['请求超时', new WebdavRequestError('timeout')],
    ])('%s 原样上抛，不重试、不移动或删除远端文件', async (_name, error) => {
        configureWebdav();
        webdavStore.writeFile.mockRejectedValue(error);

        await expect(makeBackup().exportBackupToWebdav()).rejects.toBe(error);
        expect(webdavStore.writeFile).toHaveBeenCalledTimes(1);
        expect(webdavStore.moveFile).not.toHaveBeenCalled();
        expect(webdavStore.remove).not.toHaveBeenCalled();
        expect(mockCreateWebdavStore).toHaveBeenCalledTimes(1);
    });

    it('PUT 尚未成功时不返回导出结果', async () => {
        configureWebdav();
        let completePut!: () => void;
        let notifyPut!: () => void;
        const issued = new Promise<void>(resolve => {
            notifyPut = resolve;
        });
        webdavStore.writeFile.mockImplementation(() => {
            notifyPut();
            return new Promise<void>(resolve => {
                completePut = resolve;
            });
        });
        let completed = false;
        const pending = makeBackup()
            .exportBackupToWebdav()
            .then(result => {
                completed = true;
                return result;
            });
        await issued;
        await Promise.resolve();
        expect(completed).toBe(false);
        completePut();
        await expect(pending).resolves.toMatchObject({
            location: '/MusicFree/MusicFreeBackup.json',
        });
        expect(completed).toBe(true);
    });

    it('字节数由上传文本算出，不额外回查远端', async () => {
        configureWebdav();

        const result = await makeBackup().exportBackupToWebdav();

        const [, text] = webdavStore.writeFile.mock.calls[0]!;
        // 信封是纯 ASCII 骨架，字节数应与字符数一致
        expect(result.sizeBytes).toBe((text as string).length);
        expect(webdavStore.getFileSize).not.toHaveBeenCalled();
    });

    it('导入前先查远端大小，超限拒收且不下载', async () => {
        configureWebdav();
        webdavStore.getFileSize.mockResolvedValue(64 * 1024 * 1024 + 1);

        await expect(
            makeBackup().parseBackupFromWebdav(),
        ).resolves.toMatchObject({ ok: false, reason: 'tooLarge' });
        expect(webdavStore.readFile).not.toHaveBeenCalled();
    });

    it('导入读取协议固定路径并解析', async () => {
        configureWebdav();
        webdavStore.readFile.mockResolvedValue(
            JSON.stringify({
                format: 'musicfree-backup',
                version: 2,
                sections: { musicSheets: [] },
            }),
        );

        await expect(
            makeBackup().parseBackupFromWebdav(),
        ).resolves.toMatchObject({ ok: true });
        // 字节数一并交给读取方：它拿这个折算传输超时预算，不必自己再 stat 一次
        expect(webdavStore.readFile).toHaveBeenCalledWith(
            '/MusicFree/MusicFreeBackup.json',
            2048,
        );
    });

    it.each([
        [0, '服务端没报 content-length（库当 "0"）'],
        [Number.NaN, '空的 content-length（parseInt 出 NaN）'],
    ])(
        '大小不可信（%p，%s）时按互通上限给传输预算，不掐断仍在正常下载的大备份',
        async size => {
            configureWebdav();
            webdavStore.getFileSize.mockResolvedValue(size);
            webdavStore.readFile.mockResolvedValue(
                JSON.stringify({
                    format: 'musicfree-backup',
                    version: 2,
                    sections: { musicSheets: [] },
                }),
            );

            await makeBackup().parseBackupFromWebdav();

            expect(webdavStore.readFile).toHaveBeenCalledWith(
                '/MusicFree/MusicFreeBackup.json',
                64 * 1024 * 1024,
            );
        },
    );

    it.each([0, 1, Number.NaN, -1])(
        '远端大小为 %p 时仍校验实际正文字节数',
        async size => {
            configureWebdav();
            webdavStore.getFileSize.mockResolvedValue(size);
            // 读回来的正文超过互通上限（此处直接造一个够大的字符串）
            webdavStore.readFile.mockResolvedValue(
                'x'.repeat(64 * 1024 * 1024 + 1),
            );

            await expect(
                makeBackup().parseBackupFromWebdav(),
            ).resolves.toMatchObject({
                ok: false,
                reason: 'tooLarge',
                sizeBytes: 64 * 1024 * 1024 + 1,
            });
        },
    );

    it('服务端低报大小时按 UTF-8 字节数拒绝多字节正文', async () => {
        configureWebdav();
        webdavStore.getFileSize.mockResolvedValue(1);
        const text = '测'.repeat(Math.floor((64 * 1024 * 1024) / 3) + 1);
        webdavStore.readFile.mockResolvedValue(text);

        await expect(
            makeBackup().parseBackupFromWebdav(),
        ).resolves.toMatchObject({
            ok: false,
            reason: 'tooLarge',
            sizeBytes: text.length * 3,
        });
    });

    it('恰好等于上限的放行，不是「大于等于就拒」', async () => {
        configureWebdav();
        webdavStore.getFileSize.mockResolvedValue(0);
        // 头部是有效信封，其余用空格补到正好 64 MiB（空格与 ASCII 同为 1 字节）
        const envelope = JSON.stringify({
            format: 'musicfree-backup',
            version: 2,
            sections: { musicSheets: [] },
        });
        webdavStore.readFile.mockResolvedValue(
            envelope + ' '.repeat(64 * 1024 * 1024 - envelope.length),
        );

        await expect(
            makeBackup().parseBackupFromWebdav(),
        ).resolves.toMatchObject({ ok: true });
    });

    it('导出失败也只使用开始时的连接与取消信号', async () => {
        configureWebdav();
        const controller = new AbortController();
        webdavStore.writeFile.mockRejectedValue(new Error('连接中断'));

        await expect(
            makeBackup().exportBackupToWebdav(undefined, {
                signal: controller.signal,
            }),
        ).rejects.toThrow('连接中断');

        expect(mockCreateWebdavStore).toHaveBeenCalledTimes(1);
        expect(mockCreateWebdavStore).toHaveBeenCalledWith(
            { url: 'https://ex/dav', username: 'u', password: 'p' },
            { signal: controller.signal },
        );
        expect(webdavStore.remove).not.toHaveBeenCalled();
    });

    it('创建目录失败时不上传、不删除远端内容', async () => {
        configureWebdav();
        webdavStore.ensureDir.mockRejectedValue(new Error('目录不可写'));

        await expect(makeBackup().exportBackupToWebdav()).rejects.toThrow(
            '目录不可写',
        );
        expect(webdavStore.writeFile).not.toHaveBeenCalled();
        expect(webdavStore.moveFile).not.toHaveBeenCalled();
        expect(webdavStore.remove).not.toHaveBeenCalled();
    });

    it('上传期间修改配置，不会向新服务器发起额外请求', async () => {
        configureWebdav();
        webdavStore.writeFile.mockImplementation(() => {
            // 连接面板在导出在途时也能打开并保存
            configureWebdav({ 'webdav.url': 'https://moved/dav' });
            return Promise.reject(new Error('连接中断'));
        });

        await expect(makeBackup().exportBackupToWebdav()).rejects.toThrow(
            '连接中断',
        );

        expect(mockCreateWebdavStore).toHaveBeenCalledTimes(1);
        expect(mockCreateWebdavStore.mock.calls[0]![0]).toMatchObject({
            url: 'https://ex/dav',
        });
        expect(webdavStore.remove).not.toHaveBeenCalled();
    });

    it('快照失败时不开始远端写入', async () => {
        configureWebdav();
        snapshotPlugins.mockRejectedValue(new Error('快照失败'));

        await expect(makeBackup().exportBackupToWebdav()).rejects.toThrow(
            '快照失败',
        );
        expect(webdavStore.ensureDir).not.toHaveBeenCalled();
        expect(webdavStore.writeFile).not.toHaveBeenCalled();
        expect(webdavStore.remove).not.toHaveBeenCalled();
    });

    it('取消信号一路传到远端存储：导出与读取都要能中途停下', async () => {
        configureWebdav();
        const controller = new AbortController();

        await makeBackup().exportBackupToWebdav(undefined, {
            signal: controller.signal,
        });
        await makeBackup().parseBackupFromWebdav({
            signal: controller.signal,
        });

        for (const [, options] of mockCreateWebdavStore.mock.calls) {
            expect(options).toEqual({ signal: controller.signal });
        }
        expect(mockCreateWebdavStore).toHaveBeenCalledTimes(2);
    });

    it('凭据绝不进备份：settings 段不含任何 webdav 键', async () => {
        configureWebdav();
        // 快照走 getStored；让三个凭据键都「已被用户设过」，否则这条断言什么也证明不了
        configGetStored.mockImplementation((key: ConfigKey) =>
            key.startsWith('webdav.') ? `SENTINEL-${key}` : undefined,
        );

        await makeBackup().exportBackupToWebdav(['settings']);

        const [, text] = webdavStore.writeFile.mock.calls[0]!;
        const uploaded = JSON.parse(text as string) as {
            sections: { settings: { values: Record<string, unknown> } };
        };
        expect(Object.keys(uploaded.sections.settings.values)).not.toContain(
            'webdav.url',
        );
        expect(text).not.toContain('SENTINEL');
    });

    it('恶意备份塞进 webdav 凭据也无法劫持：既不校验也不写入', async () => {
        const parsed = {
            ok: true as const,
            variant: 'v2' as const,
            sections: {
                settings: {
                    values: {
                        'webdav.url': 'https://attacker/dav',
                        'webdav.password': 'stolen',
                        'lyric.fontSize': 'large',
                    },
                },
            },
        } as unknown as ParsedBackup;

        await makeBackup().restoreBackup(parsed, { mode: 'append' });

        for (const [key] of configIsValid.mock.calls) {
            expect(String(key)).not.toContain('webdav');
        }
        for (const [key] of deps.config.set.mock.calls) {
            expect(String(key)).not.toContain('webdav');
        }
        // 白名单内的键仍照常恢复，证明这条不是因为整段没跑而通过
        expect(deps.config.set).toHaveBeenCalledWith('lyric.fontSize', 'large');
    });
});

describe('从 URL 导入', () => {
    const validBackup = JSON.stringify({
        format: 'musicfree-backup',
        version: 2,
        sections: { musicSheets: [] },
    });

    const OriginalRequest = global.XMLHttpRequest;
    let request: XMLHttpRequest;
    let send: jest.Mock;
    let abort: jest.Mock;
    let responseText: string;
    let status: number;
    let readyState: number;

    beforeEach(() => {
        jest.useFakeTimers();
        responseText = validBackup;
        status = 200;
        readyState = 2;
        send = jest.fn(() => {
            request.onreadystatechange?.({} as Event);
            request.onload?.({} as ProgressEvent);
        });
        abort = jest.fn();
        request = {
            open: jest.fn(),
            send,
            abort,
            get responseText() {
                return responseText;
            },
            get status() {
                return status;
            },
            get readyState() {
                return readyState;
            },
        } as unknown as XMLHttpRequest;
        global.XMLHttpRequest = jest.fn(
            () => request,
        ) as unknown as typeof XMLHttpRequest;
    });

    afterEach(() => {
        global.XMLHttpRequest = OriginalRequest;
        jest.useRealTimers();
    });

    it('增量文本请求完成后解析，不经 Base64 文件桥', async () => {
        await expect(
            makeBackup().parseBackupFromUrl('https://ex/backup.json'),
        ).resolves.toMatchObject({ ok: true });
        expect(request.open).toHaveBeenCalledWith(
            'GET',
            'https://ex/backup.json',
        );
        expect(request.responseType).toBe('text');
        expect(mockReadFile).not.toHaveBeenCalled();
        expect(jest.getTimerCount()).toBe(0);
    });

    it.each([
        ['file:// 被拒，不发起下载', 'file:///etc/passwd'],
        ['非地址输入被拒', '我的备份'],
    ])('%s', async (_name, input) => {
        await expect(makeBackup().parseBackupFromUrl(input)).resolves.toEqual({
            ok: false,
            reason: 'invalidUrl',
        });
        expect(send).not.toHaveBeenCalled();
    });

    it('HTTP 错误状态如实抛出，不伪装成内容损坏', async () => {
        status = 404;

        await expect(
            makeBackup().parseBackupFromUrl('https://ex/nope.json'),
        ).rejects.toThrow('404');
        expect(abort).toHaveBeenCalledTimes(1);
        expect(request.onload).toBeNull();
    });

    it('网络失败终止原生请求并清理计时器', async () => {
        send.mockImplementation(() => request.onerror?.({} as ProgressEvent));
        await expect(
            makeBackup().parseBackupFromUrl('https://ex/a.json'),
        ).rejects.toBeInstanceOf(TypeError);
        expect(abort).toHaveBeenCalled();
        expect(jest.getTimerCount()).toBe(0);
    });

    it('已取消时不发起下载', async () => {
        const controller = new AbortController();
        controller.abort();
        await expect(
            makeBackup().parseBackupFromUrl('https://ex/a.json', {
                signal: controller.signal,
            }),
        ).rejects.toMatchObject({ name: 'AbortError' });
        expect(send).not.toHaveBeenCalled();
    });

    it('取消立即中止请求，迟到成功回调不能重新返回结果', async () => {
        const controller = new AbortController();
        send.mockImplementation(() => undefined);
        const pending = makeBackup().parseBackupFromUrl('https://ex/a.json', {
            signal: controller.signal,
        });
        const lateLoad = request.onload;
        controller.abort();
        await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        lateLoad?.call(request, {} as ProgressEvent);
        expect(abort).toHaveBeenCalledTimes(1);
        expect(jest.getTimerCount()).toBe(0);
    });

    it('首包五秒超时会中止原生请求', async () => {
        send.mockImplementation(() => undefined);
        const pending = makeBackup()
            .parseBackupFromUrl('https://ex/a.json')
            .catch(error => error);
        await jest.advanceTimersByTimeAsync(5000);
        expect(await pending).toBeInstanceOf(TimeoutError);
        expect(abort).toHaveBeenCalled();
    });

    it('收到正文后空闲十五秒中止，正常进度会延长空闲期限', async () => {
        send.mockImplementation(() =>
            request.onreadystatechange?.({} as Event),
        );
        const pending = makeBackup()
            .parseBackupFromUrl('https://ex/a.json')
            .catch(error => error);
        await jest.advanceTimersByTimeAsync(14000);
        request.onprogress?.({} as ProgressEvent);
        await jest.advanceTimersByTimeAsync(14000);
        expect(abort).not.toHaveBeenCalled();
        await jest.advanceTimersByTimeAsync(1000);
        expect(await pending).toBeInstanceOf(TimeoutError);
        expect(abort).toHaveBeenCalled();
    });

    it('原生总时限结束仍归类为超时并中止请求', async () => {
        send.mockImplementation(() => request.ontimeout?.({} as ProgressEvent));
        await expect(
            makeBackup().parseBackupFromUrl('https://ex/a.json'),
        ).rejects.toBeInstanceOf(TimeoutError);
        expect(abort).toHaveBeenCalled();
        expect(request.timeout).toBe(20000 + (64 * 1024 * 1024) / 16);
    });

    it('正文真实字节数超限会在接收中中止', async () => {
        responseText = 'x'.repeat(64 * 1024 * 1024 + 1);
        send.mockImplementation(() =>
            request.onprogress?.({} as ProgressEvent),
        );
        await expect(
            makeBackup().parseBackupFromUrl('https://ex/huge.json'),
        ).resolves.toMatchObject({ ok: false, reason: 'tooLarge' });
        expect(abort).toHaveBeenCalled();
    });

    it('跨块代理对合并计数，恰好64MiB允许解析', async () => {
        responseText = ' '.repeat(64 * 1024 * 1024 - 6) + '"\ud83c';
        send.mockImplementation(() => {
            request.onprogress?.({} as ProgressEvent);
            responseText += '\udfb5"';
            request.onprogress?.({} as ProgressEvent);
            request.onload?.({} as ProgressEvent);
        });
        await expect(
            makeBackup().parseBackupFromUrl('https://ex/exact.json'),
        ).resolves.toEqual({ ok: false, reason: 'corrupt' });
        expect(abort).not.toHaveBeenCalled();
    });

    it('内容不是备份时如实汇报，与地址无效区分开', async () => {
        responseText = '{"hello":1}';

        await expect(
            makeBackup().parseBackupFromUrl('https://ex/a.json'),
        ).resolves.toEqual({ ok: false, reason: 'notBackup' });
    });
});

describe('classifyRestoreResult', () => {
    const ok = <T>(counts: T) => ({ status: 'ok', counts } as const);
    const absent = { status: 'skipped', reason: 'absent' } as const;
    const failed = { status: 'failed', message: 'x' } as const;
    const plugins = (over: Partial<PluginsRestoreResult> = {}) =>
        ok({
            pluginsInstalled: 0,
            pluginsSkipped: 0,
            pluginInstallFailures: [],
            subscriptionsAdded: 0,
            subscriptionsSkipped: 0,
            alternativesAdded: 0,
            alternativesSkipped: 0,
            ...over,
        });
    const sheets = (over: Partial<LocalPlaylistRestoreResult> = {}) =>
        ok({
            localPlaylistsCreated: 0,
            musicAdded: 0,
            musicDuplicatesSkipped: 0,
            invalidMusicSkipped: 0,
            ...over,
        });
    const make = (
        over: Partial<RestoreBackupResult> = {},
    ): RestoreBackupResult => ({
        musicSheets: sheets(),
        starredPlaylists: absent,
        plugins: plugins(),
        mediaMeta: absent,
        settings: absent,
        localMediaIgnored: 0,
        ...over,
    });

    it('\u90fd\u8fdb\u6765\u4e86\u5c31\u662f clean', () => {
        expect(classifyRestoreResult(make())).toBe('clean');
    });

    it('\u9884\u671f\u5185\u7684\u8df3\u8fc7\u4e0d\u7b97\u5185\u5bb9\u4e22\u5931', () => {
        const result = make({
            musicSheets: sheets({ musicDuplicatesSkipped: 9 }),
            plugins: plugins({ pluginsSkipped: 3, alternativesSkipped: 2 }),
            settings: ok({ applied: 1, skipped: 7 }),
            mediaMeta: ok({ upserted: 1, skipped: 5 }),
        });
        expect(classifyRestoreResult(result)).toBe('clean');
    });

    it('\u63d2\u4ef6\u88c5\u4e0d\u4e0a\u7b97\u6709\u5185\u5bb9\u6ca1\u8fdb\u6765', () => {
        const result = make({
            plugins: plugins({
                pluginInstallFailures: [{ srcUrl: 'u', reason: 'unexpected' }],
            }),
        });
        expect(classifyRestoreResult(result)).toBe('partial');
    });

    it('\u975e\u6cd5\u6b4c\u66f2\u88ab\u4e22\u7b97\u6709\u5185\u5bb9\u6ca1\u8fdb\u6765', () => {
        expect(
            classifyRestoreResult(
                make({ musicSheets: sheets({ invalidMusicSkipped: 1 }) }),
            ),
        ).toBe('partial');
    });

    it('\u6709\u6bb5\u5931\u8d25\u4f46\u4e5f\u6709\u6bb5\u6210\u529f\u662f partial', () => {
        expect(classifyRestoreResult(make({ settings: failed }))).toBe(
            'partial',
        );
    });

    it('\u6709\u6bb5\u5931\u8d25\u4e14\u6ca1\u4e00\u6bb5\u6210\u529f\u662f allFailed', () => {
        const result = make({
            musicSheets: failed,
            plugins: failed,
            starredPlaylists: absent,
        });
        expect(classifyRestoreResult(result)).toBe('allFailed');
    });

    it('\u53ea\u6709\u8de8\u8bbe\u5907\u5ffd\u7565\u4ecd\u7b97 clean\uff0c\u662f\u5426\u8fdb\u7ed3\u679c\u9875\u7531\u8c03\u7528\u65b9\u5355\u72ec\u5224', () => {
        expect(classifyRestoreResult(make({ localMediaIgnored: 4 }))).toBe(
            'clean',
        );
    });
});
