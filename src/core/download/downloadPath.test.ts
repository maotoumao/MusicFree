/**
 * 下载目录解析：配置里的值可能是空串、垃圾、或带尾斜杠
 * 解析不出合法路径时必须回默认目录——把一个拼不出路径的值递给原生，
 * 换来的是一堆无从解释的下载失败
 */
import {
    isDefaultDownloadDir,
    isUsableDownloadDir,
    normalizeDownloadDir,
    resolveDownloadDir,
} from './downloadPath';

import type { IConfig } from '@/core/config';

jest.mock('@/infra/paths', () => ({ defaultDownloadDir: '/data/download' }));

const configWith = (downloadPath: unknown): IConfig =>
    ({ get: () => downloadPath } as unknown as IConfig);

describe('resolveDownloadDir', () => {
    it('未设置（空串）时用默认目录', () => {
        expect(resolveDownloadDir(configWith(''))).toBe('/data/download');
    });

    it('配置项整个缺失时用默认目录', () => {
        expect(resolveDownloadDir(configWith(undefined))).toBe(
            '/data/download',
        );
    });

    it('自定义目录原样用，尾斜杠去掉（要参与路径拼接与前缀比对）', () => {
        expect(
            resolveDownloadDir(configWith('/storage/emulated/0/Music/')),
        ).toBe('/storage/emulated/0/Music');
    });

    it('存进来的不是字符串也回默认目录，不抛（config.get 不过 rules）', () => {
        expect(resolveDownloadDir(configWith(42))).toBe('/data/download');
        expect(resolveDownloadDir(configWith({ path: '/x' }))).toBe(
            '/data/download',
        );
    });

    it('相对路径等非法值按未设置处理，回默认目录', () => {
        expect(resolveDownloadDir(configWith('Music'))).toBe('/data/download');
        expect(resolveDownloadDir(configWith('/'))).toBe('/data/download');
        expect(resolveDownloadDir(configWith('   '))).toBe('/data/download');
    });
});

describe('isDefaultDownloadDir', () => {
    it('未设置即默认', () => {
        expect(isDefaultDownloadDir(configWith(''))).toBe(true);
    });

    it('显式写成默认目录本身也算默认（UI 不必给「恢复默认」）', () => {
        expect(isDefaultDownloadDir(configWith('/data/download'))).toBe(true);
    });

    it('自选目录不算默认', () => {
        expect(isDefaultDownloadDir(configWith('/storage/x'))).toBe(false);
    });
});

describe('isUsableDownloadDir / normalizeDownloadDir', () => {
    it('只接受有实际段的绝对路径', () => {
        expect(isUsableDownloadDir('/storage/x')).toBe(true);
        expect(isUsableDownloadDir('/')).toBe(false);
        expect(isUsableDownloadDir('storage/x')).toBe(false);
        expect(isUsableDownloadDir('')).toBe(false);
    });

    it('规范化去首尾空白与尾斜杠；非法回 null', () => {
        expect(normalizeDownloadDir('  /storage/x/  ')).toBe('/storage/x');
        expect(normalizeDownloadDir('storage/x')).toBeNull();
    });
});
