import { Section } from '@/components/ui/Section';
import { useT } from '@/i18n';
import { useEqualizerSummary } from '@/widgets/hooks/useEqualizerSummary';
import { showEqualizerPanel } from '@/widgets/overlays/EqualizerPanel';

import { ActionRow, ChoiceRow, SwitchRow } from './SettingRows';

import type { QualityKey } from '@/types';

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

/**
 * 播放分区：联网与续播行为、失败处置、音质与回退，末尾挂音效入口
 * 音效行恒可点：设备是否支持要等 audioEffect.setup 探测完才知道，
 * 早于探测完成时按不支持渲染会说谎；不支持的解释由面板自己给
 */
export function PlaybackSection() {
    const t = useT();
    const equalizerSummary = useEqualizerSummary();
    return (
        <Section title={t('settings.playback.section')}>
            <SwitchRow
                configKey="basic.autoPlayWhenAppStart"
                label={t('settings.playback.autoPlayWhenAppStart')}
            />
            <SwitchRow
                configKey="basic.notInterrupt"
                label={t('settings.playback.mixWithOthers')}
            />
            <ChoiceRow
                configKey="basic.clickMusicInSearch"
                label={t('settings.playback.clickMusicInSearch')}
                options={[
                    {
                        value: 'playMusic',
                        label: t(
                            'settings.playback.clickMusicInSearchOption.playMusic',
                        ),
                    },
                    {
                        value: 'playMusicAndReplace',
                        label: t(
                            'settings.playback.clickMusicInSearchOption.playMusicAndReplace',
                        ),
                    },
                ]}
            />
            <SwitchRow
                configKey="basic.useCelluarNetworkPlay"
                label={t('settings.playback.cellularNetwork')}
                description={t('settings.playback.cellularNetworkHint')}
            />
            <SwitchRow
                configKey="basic.autoStopWhenError"
                label={t('settings.playback.autoStopWhenError')}
                description={t('settings.playback.autoStopWhenErrorHint')}
            />
            <SwitchRow
                configKey="basic.tryChangeSourceWhenPlayFail"
                label={t('settings.playback.tryChangeSourceWhenPlayFail')}
                description={t(
                    'settings.playback.tryChangeSourceWhenPlayFailHint',
                )}
            />
            <ChoiceRow
                configKey="basic.defaultPlayQuality"
                label={t('settings.playback.quality')}
                options={QUALITY_ORDER.map(quality => ({
                    value: quality,
                    label: t(`media.quality.${quality}`),
                }))}
            />
            <ChoiceRow
                configKey="basic.playQualityOrder"
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
            <ActionRow
                label={t('equalizerPanel.title')}
                value={equalizerSummary}
                onPress={() => showEqualizerPanel()}
            />
        </Section>
    );
}
