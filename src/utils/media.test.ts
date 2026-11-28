import { mediaHash, mediaKey } from './media';

import type { MediaRef } from '@/types';

describe('mediaHash', () => {
    /**
     * 摘要是自定义歌词等不可再生文件的文件名，属冻结的持久化契约
     * 这条断言就是防线：改 SHA 算法或改 mediaKey 编码都会让它失败，
     * 提醒改动者存量文件会全部失联、且被孤儿清理删掉
     */
    it('固定 ref 的摘要被锁定，改了要先写迁移', () => {
        const ref: MediaRef = { platform: 'demo', id: '1' };

        expect(mediaKey(ref)).toBe('["demo","1"]');
        expect(mediaHash(ref)).toBe(
            '921f41020d8f180a755310cf2b26b151c8f473d315e0caaf9342e83baafe58b6',
        );
    });

    it('输出恒为 64 位小写十六进制，可直接当文件名', () => {
        for (const ref of [
            { platform: 'demo', id: '1' },
            { platform: '本地', id: '/sdcard/a b.mp3' },
            { platform: 'x', id: '😀'.repeat(50) },
        ] satisfies MediaRef[]) {
            expect(mediaHash(ref)).toMatch(/^[0-9a-f]{64}$/);
        }
    });

    it('不同身份不撞名，同一身份稳定', () => {
        const a = mediaHash({ platform: 'demo', id: '1' });

        expect(mediaHash({ platform: 'demo', id: '1' })).toBe(a);
        expect(mediaHash({ platform: 'demo', id: '2' })).not.toBe(a);
        expect(mediaHash({ platform: 'other', id: '1' })).not.toBe(a);
    });

    it('分隔符不会让两首歌撞名（沿用 mediaKey 的 JSON 编码）', () => {
        expect(mediaHash({ platform: 'a', id: 'b:c' })).not.toBe(
            mediaHash({ platform: 'a:b', id: 'c' }),
        );
    });
});
