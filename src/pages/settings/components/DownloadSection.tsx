import { Section } from '@/components/ui/Section';
import { isDownloadSupported } from '@/core/download';
import { localMusic, useAddDownloadsToLibrary } from '@/core/localMusic';
import { useT } from '@/i18n';

import { useDownloadDirSetting } from '../hooks/useDownloadDirSetting';

import {
    ActionRow,
    ChoiceRow,
    ControlledSwitchRow,
    SwitchRow,
} from './SettingRows';

import type { QualityKey } from '@/types';
import type { ReactElement } from 'react';

/**
 * 音质档位的展示顺序（低→高）
 * 与 utils/media 的 QUALITY_KEYS 排位解耦：那是回退算法与校验的排位，展示顺序由 UI 自定
 */
const QUALITY_ORDER: readonly QualityKey[] = [
    'low',
    'standard',
    'high',
    'super',
];

/** 并发档位；值域见 configRules['basic.maxDownload'] */
const MAX_CONCURRENT_CHOICES = [1, 2, 3, 4, 5] as const;

/** 任务间隔档位（毫秒）；0 = 不等待 */
const INTERVAL_CHOICES = [0, 1000, 3000, 5000, 10000] as const;

/**
 * 下载分区：计费网络闸门 + 音质与回退 + 并发和节流
 * 音质与回退和播放分区同形，但两者是彼此独立的偏好，不共享取值
 * 无下载引擎的平台（当前 iOS）整块不渲染：那里改这些选项一条都不会生效
 */
export function DownloadSection(): ReactElement | null {
    const t = useT();
    // hook 必须无条件调用，故放在平台判定之前（无下载引擎的平台整块不渲染，值也就没人看）
    const downloadDir = useDownloadDirSetting();
    const addDownloadsToLibrary = useAddDownloadsToLibrary();
    if (!isDownloadSupported) {
        return null;
    }
    return (
        <Section title={t('settings.download.section')}>
            {/*
             * 目录放在分区最前：它决定「文件去哪了」，是用户最想先确认的一条；
             * 副标题给完整路径（不截断——用户要靠它去文件管理器里找歌）
             */}
            <ActionRow
                label={t('settings.download.dir')}
                description={downloadDir.dir}
                // busy 只播报给读屏，挡住连点要 disabled；两行各禁各的——
                // 它们是两件事，共用一个标志会让点这一行时那一行也跟着变灰
                busy={downloadDir.choosing}
                disabled={downloadDir.choosing}
                onPress={downloadDir.choose}
            />
            {downloadDir.isDefault ? null : (
                <ActionRow
                    label={t('settings.download.dirReset')}
                    description={t('settings.download.dirResetHint')}
                    busy={downloadDir.resetting}
                    disabled={downloadDir.resetting}
                    onPress={downloadDir.reset}
                />
            )}
            <SwitchRow
                configKey="basic.useCelluarNetworkDownload"
                label={t('settings.download.useCellularNetwork')}
                description={t('settings.download.useCellularNetworkHint')}
            />
            <ControlledSwitchRow
                label={t('settings.download.addToLibrary')}
                checked={addDownloadsToLibrary}
                onChange={includeDownloadDir =>
                    localMusic.setScanSettings({ includeDownloadDir })
                }
            />
            <ChoiceRow
                configKey="basic.defaultDownloadQuality"
                label={t('settings.download.quality')}
                options={QUALITY_ORDER.map(quality => ({
                    value: quality,
                    label: t(`media.quality.${quality}`),
                }))}
            />
            <ChoiceRow
                configKey="basic.downloadQualityOrder"
                label={t('settings.qualityFallback')}
                options={[
                    {
                        value: 'asc',
                        label: t('settings.qualityFallbackOption.asc'),
                    },
                    {
                        value: 'desc',
                        label: t('settings.qualityFallbackOption.desc'),
                    },
                ]}
            />
            <ChoiceRow
                configKey="basic.maxDownload"
                label={t('settings.download.maxConcurrent')}
                options={MAX_CONCURRENT_CHOICES.map(count => ({
                    value: count,
                    label: String(count),
                }))}
            />
            <ChoiceRow
                configKey="basic.downloadInterval"
                label={t('settings.download.interval')}
                description={t('settings.download.intervalHint')}
                options={INTERVAL_CHOICES.map(ms => ({
                    value: ms,
                    label:
                        ms === 0
                            ? t('settings.download.intervalNone')
                            : t('settings.download.intervalSeconds', {
                                  count: ms / 1000,
                              }),
                }))}
            />
        </Section>
    );
}
