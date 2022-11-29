import {nanoid} from 'nanoid';

const locks = new Map<string, string>();

export interface ILock {
    key: string;
    lockId: string;
    valid: () => boolean;
    release: () => void;
}

function requireLock(key: string): ILock {
    const lockId = nanoid();
    locks.set(key, lockId);

    return {
        key,
        lockId,
        /** 锁是否有效 */
        valid() {
            const currentLockId = locks.get(key);
            return !currentLockId || currentLockId === lockId;
        },
        /** 释放后赋空 */
        release() {
            const currentLockId = locks.get(key);
            if (currentLockId === lockId) {
                locks.delete(key);
            }
        },
    };
}

export {requireLock};
