/**
 * 操作锁与取消口的契约
 * 这层没有 React，直接跑；`atomStore` 是模块级单例，故每个用例先把占位放干净
 */
import { atomStore } from '@/utils/atomStore';

import {
    backupCancellableAtom,
    backupOpAtom,
    cancelBackupOp,
    endBackupOp,
    tryBeginBackupOp,
} from '.';

beforeEach(() => {
    // 上一个用例可能故意留着占位，这里按当前占位释放
    const current = atomStore.get(backupOpAtom);
    if (current !== null) {
        endBackupOp(current);
    }
});

describe('抢占与释放', () => {
    it('抢到就给出取消口，并把占位与可取消性一起写上', () => {
        const handle = tryBeginBackupOp('exporting', true);

        expect(handle?.signal.aborted).toBe(false);
        expect(atomStore.get(backupOpAtom)).toBe('exporting');
        expect(atomStore.get(backupCancellableAtom)).toBe(true);
    });

    it('已有操作在跑时抢不到', () => {
        tryBeginBackupOp('exporting', true);

        expect(tryBeginBackupOp('reading', true)).toBeUndefined();
        // 也不许把前一项的可取消性改掉
        expect(atomStore.get(backupOpAtom)).toBe('exporting');
        expect(atomStore.get(backupCancellableAtom)).toBe(true);
    });

    it('可取消性按这一次的调用给，不按操作名', () => {
        // 同一个 exporting：传 WebDAV 接得上取消，写本机下载目录接不上
        tryBeginBackupOp('exporting', false);
        expect(atomStore.get(backupCancellableAtom)).toBe(false);
    });

    it('释放时把可取消性一并清掉，横幅不会留下一个孤零零的取消键', () => {
        tryBeginBackupOp('reading', true);

        endBackupOp('reading');

        expect(atomStore.get(backupOpAtom)).toBeNull();
        expect(atomStore.get(backupCancellableAtom)).toBe(false);
    });

    it('不是自己占的就不动：迟到的释放不许清掉别人的状态', () => {
        const handle = tryBeginBackupOp('restoring', false);

        endBackupOp('reading');

        expect(atomStore.get(backupOpAtom)).toBe('restoring');
        // 也不许摘掉正在跑的那次操作的取消口——那会让取消键从此变哑
        cancelBackupOp();
        expect(handle?.signal.aborted).toBe(true);
    });
});

describe('取消', () => {
    it('只发信号、不清占位：旧操作还在收尾时不许开始新的', () => {
        const handle = tryBeginBackupOp('exporting', true);

        cancelBackupOp();

        expect(handle?.signal.aborted).toBe(true);
        expect(atomStore.get(backupOpAtom)).toBe('exporting');
        expect(tryBeginBackupOp('reading', true)).toBeUndefined();
    });

    it('连按两次不抛，也只 abort 一次', () => {
        const handle = tryBeginBackupOp('exporting', true);
        let fired = 0;
        handle?.signal.addEventListener('abort', () => {
            fired += 1;
        });

        cancelBackupOp();
        cancelBackupOp();

        expect(fired).toBe(1);
    });

    it('没有操作在跑时取消是空操作', () => {
        expect(() => cancelBackupOp()).not.toThrow();
    });

    it('上一项释放后再取消，不会误伤下一次操作的信号', () => {
        const first = tryBeginBackupOp('exporting', true);
        endBackupOp('exporting');
        const second = tryBeginBackupOp('reading', true);

        cancelBackupOp();

        expect(second?.signal.aborted).toBe(true);
        expect(first?.signal.aborted).toBe(false);
    });
});
