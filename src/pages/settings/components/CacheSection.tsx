import { Section } from '@/components/ui/Section';
import { config, useConfig } from '@/core/config';
import { useT } from '@/i18n';
import { formatFileSize } from '@/utils/number';

import { useClearCaches } from '../hooks/useClearCaches';
import { useStreamingCacheSize } from '../hooks/useStreamingCacheSize';

import { ActionRow, ChoiceRow } from './SettingRows';

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;
const CACHE_LIMITS = [256 * MIB, 512 * MIB, GIB, 2 * GIB, 4 * GIB, 8 * GIB];

function formatCacheLimit(bytes: number): string {
    if (bytes % GIB === 0) {
        return `${bytes / GIB} GB`;
    }
    if (bytes % MIB === 0) {
        return `${bytes / MIB} MB`;
    }
    return formatFileSize(bytes);
}

/** 缓存分区：容量偏好 + 音乐/图片缓存清理 */
export function CacheSection() {
    const t = useT();
    const currentLimit = useConfig('basic.maxCacheSize');
    const sizeQuery = useStreamingCacheSize();
    const { clearing, operationPending, clearMusicCache, clearImageCache } =
        useClearCaches();

    const limits =
        currentLimit !== undefined &&
        config.isValid('basic.maxCacheSize', currentLimit) &&
        !CACHE_LIMITS.includes(currentLimit)
            ? [...CACHE_LIMITS, currentLimit].sort((a, b) => a - b)
            : CACHE_LIMITS;

    const musicCacheSize =
        clearing === 'music'
            ? t('settings.cache.clearing')
            : sizeQuery.isPending
            ? t('common.loading')
            : sizeQuery.isError && sizeQuery.data === undefined
            ? t('feedback.loadFailed')
            : sizeQuery.data === undefined
            ? undefined
            : formatFileSize(sizeQuery.data);

    return (
        <Section title={t('settings.cache.section')}>
            <ChoiceRow
                configKey="basic.maxCacheSize"
                label={t('settings.cache.musicLimit')}
                description={t('settings.cache.restartHint')}
                options={limits.map(value => ({
                    value,
                    label: formatCacheLimit(value),
                }))}
            />
            <ActionRow
                label={t('settings.cache.music.clear')}
                value={musicCacheSize}
                busy={clearing === 'music'}
                disabled={operationPending}
                onPress={clearMusicCache}
            />
            <ActionRow
                label={t('settings.cache.image.clear')}
                value={
                    clearing === 'image'
                        ? t('settings.cache.clearing')
                        : undefined
                }
                busy={clearing === 'image'}
                disabled={operationPending}
                onPress={clearImageCache}
            />
        </Section>
    );
}
