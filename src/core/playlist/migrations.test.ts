import { playlistMigrations, runMigrations } from './migrations';

import type { LegacyImportReport } from './legacyImport';
import type { PlaylistMigration, StoreVersionCell } from './migrations';

/** 可注入的版本 cell，记录每次提交 */
function fakeVersion(initial = 0): StoreVersionCell & { commits: number[] } {
    let v = initial;
    const commits: number[] = [];
    return {
        get: () => v,
        set: (version: number) => {
            v = version;
            commits.push(version);
        },
        commits,
    };
}

/** 记录执行次序的假迁移；shouldThrow=true 时 migrate 抛错 */
function fakeMigration(
    toVersion: number,
    log: number[],
    shouldThrow = false,
): PlaylistMigration {
    return {
        toVersion,
        migrate: () => {
            if (shouldThrow) {
                throw new Error(`fail@${toVersion}`);
            }
            log.push(toVersion);
        },
    };
}

describe('runMigrations', () => {
    it('乱序传入按 toVersion 升序执行', () => {
        const version = fakeVersion(0);
        const log: number[] = [];
        runMigrations(version, [
            fakeMigration(3, log),
            fakeMigration(1, log),
            fakeMigration(2, log),
        ]);
        expect(log).toEqual([1, 2, 3]);
        expect(version.commits).toEqual([1, 2, 3]);
    });

    it('跳过 toVersion <= 当前版本的步骤', () => {
        const version = fakeVersion(2);
        const log: number[] = [];
        runMigrations(version, [
            fakeMigration(1, log),
            fakeMigration(2, log),
            fakeMigration(3, log),
        ]);
        expect(log).toEqual([3]);
        expect(version.commits).toEqual([3]);
    });

    it('migrate 与 commit 严格交替', () => {
        const events: string[] = [];
        let v = 0;
        const version: StoreVersionCell = {
            get: () => v,
            set: n => {
                v = n;
                events.push(`commit:${n}`);
            },
        };
        const step = (n: number): PlaylistMigration => ({
            toVersion: n,
            migrate: () => {
                events.push(`migrate:${n}`);
            },
        });
        runMigrations(version, [step(1), step(2)]);
        expect(events).toEqual([
            'migrate:1',
            'commit:1',
            'migrate:2',
            'commit:2',
        ]);
    });

    it('某步 migrate 抛错则中断：版本停在上一步、后续不跑、异常冒泡', () => {
        const version = fakeVersion(0);
        const log: number[] = [];
        expect(() =>
            runMigrations(version, [
                fakeMigration(1, log),
                fakeMigration(2, log, true),
                fakeMigration(3, log),
            ]),
        ).toThrow('fail@2');
        expect(log).toEqual([1]);
        expect(version.commits).toEqual([1]);
        expect(version.get()).toBe(1);
    });

    it('commit 抛错则中断：已提交步保留、后续不跑、异常冒泡', () => {
        const log: number[] = [];
        let v = 0;
        const version: StoreVersionCell = {
            get: () => v,
            set: n => {
                if (n === 2) {
                    throw new Error('commit failed');
                }
                v = n;
            },
        };
        expect(() =>
            runMigrations(version, [
                fakeMigration(1, log),
                fakeMigration(2, log),
                fakeMigration(3, log),
            ]),
        ).toThrow('commit failed');
        expect(v).toBe(1);
        expect(log).toEqual([1, 2]);
    });

    it('已是最新版本则重放为空操作（幂等）', () => {
        const version = fakeVersion(3);
        const log: number[] = [];
        runMigrations(version, [
            fakeMigration(1, log),
            fakeMigration(2, log),
            fakeMigration(3, log),
        ]);
        expect(log).toEqual([]);
        expect(version.commits).toEqual([]);
    });

    it('空迁移表为空操作', () => {
        const version = fakeVersion(0);
        runMigrations(version, []);
        expect(version.commits).toEqual([]);
        expect(version.get()).toBe(0);
    });
});

describe('runMigrations 预检', () => {
    it('重复 toVersion 抛错且不执行任何步骤', () => {
        const version = fakeVersion(0);
        const log: number[] = [];
        expect(() =>
            runMigrations(version, [
                fakeMigration(1, log),
                fakeMigration(1, log),
            ]),
        ).toThrow(/迁移表非法/);
        expect(log).toEqual([]);
        expect(version.commits).toEqual([]);
    });

    it.each([NaN, Infinity, 0, -1, 1.5])(
        'toVersion=%p 非严格递增正整数则抛错、无副作用',
        bad => {
            const version = fakeVersion(0);
            const log: number[] = [];
            expect(() =>
                runMigrations(version, [fakeMigration(bad, log)]),
            ).toThrow(/迁移表非法/);
            expect(log).toEqual([]);
            expect(version.commits).toEqual([]);
        },
    );

    it('当前版本非法（NaN）则抛错、不执行迁移', () => {
        const version = fakeVersion(NaN);
        const log: number[] = [];
        expect(() => runMigrations(version, [fakeMigration(1, log)])).toThrow(
            /版本非法/,
        );
        expect(log).toEqual([]);
    });
});

describe('playlistMigrations', () => {
    it('返回 v1 步骤，migrate 跑通 legacy 导入', () => {
        const stores = new Map<string, Map<string, string>>();
        const openStore = (id: string) => {
            let s = stores.get(id);
            if (!s) {
                s = new Map();
                stores.set(id, s);
            }
            const store = s;
            return {
                getString: (k: string) => store.get(k),
                set: (k: string, v: string) => {
                    store.set(k, v);
                },
                remove: (k: string) => {
                    store.delete(k);
                },
            };
        };
        let report: LegacyImportReport | undefined;
        const migs = playlistMigrations({ openStore, importedAt: 1 }, r => {
            report = r;
        });
        expect(migs).toHaveLength(1);
        expect(migs[0]!.toVersion).toBe(1);
        expect(() => migs[0]!.migrate()).not.toThrow();
        expect(stores.get('Playlist.index')?.get('data')).toBe('[]');
        expect(report?.skippedLocalPlaylistIds).toEqual([]);
        expect(report?.starredSkipped).toBe(false);
    });
});
