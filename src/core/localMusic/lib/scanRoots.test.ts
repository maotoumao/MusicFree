/**
 * 扫描根的取法：全盘模式必须覆盖所有存储卷，且不能因取不到卷列表就丢掉内置存储
 * （丢根 = 原生把其下旧条目全算作已消失，整库被清空）
 * 候选与过滤后分两步：摘根不能藏进候选，否则任何基于候选的判断都只看得到「已自我修正」的列表
 */
import { dropExcludedRoots, scanRootCandidates } from './scanRoots';

import type { ScanSettings } from '../types';

// infra/storageVolumes 顶层要碰原生桥，本用例只用它的常量
jest.mock('@/infra/storageVolumes', () => ({
    PRIMARY_STORAGE_ROOT: '/storage/emulated/0',
}));

const settings = (patch: Partial<ScanSettings>): ScanSettings =>
    ({
        mode: 'all',
        includedDirs: [],
        excludedDirs: [],
        includeDownloadDir: true,
        minDurationSec: 0,
        minSizeBytes: 0,
        ...patch,
    } as ScanSettings);

describe('scanRootCandidates', () => {
    it('全盘：主存储根 + 各存储卷（SD 卡也扫）', () => {
        expect(
            scanRootCandidates(settings({ mode: 'all' }), [
                '/storage/emulated/0',
                '/storage/1A2B-3C4D',
            ]),
        ).toEqual(['/storage/emulated/0', '/storage/1A2B-3C4D']);
    });

    it('全盘：卷列表为空也保住主存储根', () => {
        expect(scanRootCandidates(settings({ mode: 'all' }), [])).toEqual([
            '/storage/emulated/0',
        ]);
    });

    it('全盘：卷列表没报主存储也照样补上（漏根会清空整库）', () => {
        expect(
            scanRootCandidates(settings({ mode: 'all' }), [
                '/storage/1A2B-3C4D',
            ]),
        ).toEqual(['/storage/emulated/0', '/storage/1A2B-3C4D']);
    });

    it('全盘：重复的卷根去重（原生虽也去重，别把冗余带过桥）', () => {
        expect(
            scanRootCandidates(settings({ mode: 'all' }), [
                '/storage/1A2B-3C4D',
                '/storage/1A2B-3C4D',
            ]),
        ).toEqual(['/storage/emulated/0', '/storage/1A2B-3C4D']);
    });

    it('候选不做排除过滤——摘根是下一步的事，判断要看得见原始意图', () => {
        expect(
            scanRootCandidates(
                settings({
                    mode: 'all',
                    excludedDirs: ['/storage/1A2B-3C4D'],
                }),
                ['/storage/emulated/0', '/storage/1A2B-3C4D'],
            ),
        ).toContain('/storage/1A2B-3C4D');
    });

    it('指定目录：只用用户加的目录，不掺卷根', () => {
        expect(
            scanRootCandidates(
                settings({
                    mode: 'custom',
                    includedDirs: ['/storage/x/Music'],
                }),
                ['/storage/emulated/0', '/storage/1A2B-3C4D'],
            ),
        ).toEqual(['/storage/x/Music']);
    });
});

describe('dropExcludedRoots', () => {
    it('整个被排除项盖住的 root 摘掉——照传只会让「排除整卡」变成「整卡照扫」', () => {
        expect(
            dropExcludedRoots(
                ['/storage/emulated/0', '/storage/1A2B-3C4D'],
                ['/storage/1A2B-3C4D'],
            ),
        ).toEqual(['/storage/emulated/0']);
    });

    it('排除项落在 root 之内则不影响 root（那种排除原生能正常执行）', () => {
        expect(
            dropExcludedRoots(
                ['/storage/emulated/0', '/storage/1A2B-3C4D'],
                ['/storage/1A2B-3C4D/Music'],
            ),
        ).toEqual(['/storage/emulated/0', '/storage/1A2B-3C4D']);
    });

    it('按段边界比对：/Music 的排除不误伤 /MusicBackup', () => {
        expect(
            dropExcludedRoots(
                ['/storage/emulated/0/MusicBackup'],
                ['/storage/emulated/0/Music'],
            ),
        ).toEqual(['/storage/emulated/0/MusicBackup']);
    });

    it('全被排除时返回空——「什么都不扫」由调用方报失败，不偷塞根', () => {
        expect(
            dropExcludedRoots(['/storage/emulated/0'], ['/storage/emulated/0']),
        ).toEqual([]);
    });
});
