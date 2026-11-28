import { getQualityFallbackOrder, resolveDownloadSource } from './source';

import type { Plugin } from '@/core/plugin';
import type { MediaSource, MusicItem, QualityKey } from '@/types';

const music = {
    platform: 'demo',
    id: 'song-1',
    title: 't',
    artist: 'a',
} as unknown as MusicItem;

/** 用给定 getMediaSource 造一个最小 Plugin */
const mkPlugin = (
    getMediaSource: (
        m: MusicItem,
        q: QualityKey,
    ) => Promise<MediaSource | null>,
): Plugin => ({ methods: { getMediaSource } } as unknown as Plugin);

describe('getQualityFallbackOrder', () => {
    it('asc：从目标往更高、再往更低', () => {
        expect(getQualityFallbackOrder('standard', 'asc')).toEqual([
            'standard',
            'high',
            'super',
            'low',
        ]);
    });

    it('desc：从目标往更低、再往更高', () => {
        expect(getQualityFallbackOrder('high', 'desc')).toEqual([
            'high',
            'standard',
            'low',
            'super',
        ]);
    });

    it('目标不在排位表则返回完整排位', () => {
        expect(getQualityFallbackOrder('unknown' as QualityKey, 'asc')).toEqual(
            ['low', 'standard', 'high', 'super'],
        );
    });
});

describe('resolveDownloadSource', () => {
    it('返回首个 progressive 直链 + 实际命中音质', async () => {
        const plugin = mkPlugin(async (_m, q) =>
            q === 'high' ? { url: 'https://x/a.mp3', quality: q } : null,
        );
        const r = await resolveDownloadSource(plugin, music, 'standard', 'asc');
        expect(r).toEqual({
            url: 'https://x/a.mp3',
            headers: {},
            resolvedQuality: 'high',
        });
    });

    it('跳过 HLS/DASH 继续回退', async () => {
        const plugin = mkPlugin(async (_m, q) => {
            if (q === 'standard') return { url: 'https://x/a.m3u8' };
            if (q === 'high') return { url: 'https://x/a.flac' };
            return null;
        });
        const r = await resolveDownloadSource(plugin, music, 'standard', 'asc');
        expect(r?.url).toBe('https://x/a.flac');
    });

    it('getMediaSource 抛错视为无源、继续回退', async () => {
        const plugin = mkPlugin(async (_m, q) => {
            if (q === 'standard') throw new Error('boom');
            return q === 'high' ? { url: 'https://x/a.mp3' } : null;
        });
        const r = await resolveDownloadSource(plugin, music, 'standard', 'asc');
        expect(r?.resolvedQuality).toBe('high');
    });

    it('全部音质无源则返 null', async () => {
        const plugin = mkPlugin(async () => null);
        expect(
            await resolveDownloadSource(plugin, music, 'standard', 'asc'),
        ).toBeNull();
    });

    it('采信插件声明的实际命中音质（ms.quality）', async () => {
        const plugin = mkPlugin(async (_m, q) =>
            q === 'standard'
                ? { url: 'https://x/a.flac', quality: 'high' }
                : null,
        );
        const r = await resolveDownloadSource(plugin, music, 'standard', 'asc');
        expect(r?.resolvedQuality).toBe('high');
    });

    it('跳过非 http(s) URL（ftp/file）继续回退', async () => {
        const plugin = mkPlugin(async (_m, q) => {
            if (q === 'standard') return { url: 'ftp://x/a.mp3' };
            if (q === 'high') return { url: 'https://x/a.mp3' };
            return null;
        });
        const r = await resolveDownloadSource(plugin, music, 'standard', 'asc');
        expect(r?.url).toBe('https://x/a.mp3');
    });

    it('并入 userAgent 到 headers', async () => {
        const plugin = mkPlugin(async () => ({
            url: 'https://x/a.mp3',
            userAgent: 'UA/1',
        }));
        const r = await resolveDownloadSource(plugin, music, 'standard', 'asc');
        expect(r?.headers['User-Agent']).toBe('UA/1');
    });
});
