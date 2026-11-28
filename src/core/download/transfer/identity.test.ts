import { contentKeyOf, finalNameOf, stagingKeyOf } from './identity';

import type { MediaRef, MusicItem } from '@/types';

const ref: MediaRef = { platform: 'demo', id: 'song-1' };
const item = (title: string, artist: string): MusicItem =>
    ({ platform: 'demo', id: 'song-1', title, artist } as unknown as MusicItem);

describe('contentKeyOf', () => {
    it('对同一 ref + 音质稳定', () => {
        expect(contentKeyOf(ref, 'standard')).toBe(
            contentKeyOf(ref, 'standard'),
        );
    });

    it('不同音质得到不同 contentKey', () => {
        expect(contentKeyOf(ref, 'standard')).not.toBe(
            contentKeyOf(ref, 'high'),
        );
    });

    it('是 64 位小写 hex', () => {
        expect(contentKeyOf(ref, 'standard')).toMatch(/^[0-9a-f]{64}$/);
    });

    it('不同 platform / id 得到不同 contentKey（ref 确实参与，非只 hash 音质）', () => {
        expect(contentKeyOf({ platform: 'a', id: '1' }, 'standard')).not.toBe(
            contentKeyOf({ platform: 'b', id: '1' }, 'standard'),
        );
        expect(contentKeyOf({ platform: 'a', id: '1' }, 'standard')).not.toBe(
            contentKeyOf({ platform: 'a', id: '2' }, 'standard'),
        );
    });
});

describe('stagingKeyOf', () => {
    it('复用 contentKey', () => {
        const ck = contentKeyOf(ref, 'standard');
        expect(stagingKeyOf(ck)).toBe(ck);
    });
});

describe('finalNameOf', () => {
    it('拼 title - artist', () => {
        expect(finalNameOf(item('夜曲', '周杰伦'))).toBe('夜曲 - 周杰伦');
    });

    it('无 artist 只用 title', () => {
        expect(finalNameOf(item('纯音乐', ''))).toBe('纯音乐');
    });

    it('消毒文件系统非法字符并折叠空白', () => {
        expect(finalNameOf(item('a/b:c*d?', 'e|f'))).toBe('a b c d - e f');
    });

    it('空标题回退 download', () => {
        expect(finalNameOf(item('', ''))).toBe('download');
    });

    it('. 或 .. 标题回退 download（防非法路径段）', () => {
        expect(finalNameOf(item('.', ''))).toBe('download');
        expect(finalNameOf(item('..', ''))).toBe('download');
    });

    it('超长标题按 UTF-8 字节截断（≤240）且不切断中文', () => {
        const name = finalNameOf(item('中'.repeat(200), ''));
        expect(Buffer.byteLength(name, 'utf8')).toBeLessThanOrEqual(240);
        expect(name).toMatch(/^中+$/);
    });

    it('非字符串标题（脏数据）不抛错、回退 download', () => {
        const dirty = {
            platform: 'demo',
            id: 'x',
            title: 123,
        } as unknown as MusicItem;
        expect(finalNameOf(dirty)).toBe('download');
    });
});
