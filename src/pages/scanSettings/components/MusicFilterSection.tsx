import { useCallback } from 'react';

import { ListItem } from '@/components/ui/ListItem';
import { Section } from '@/components/ui/Section';
import { Switch } from '@/components/ui/Switch';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { showActionSheetPanel } from '@/widgets/overlays/ActionSheetPanel';

import { MIN_SIZE_CHOICES } from '../hooks/useDraftScanSettings';

import type { ScanSettings } from '@/core/localMusic';

const MB = 1024 * 1024;

/** 音乐过滤区：过滤短音频 Switch + 最小文件大小（点按选档：不限 / 1 / 5 / 10 MB） */
export function MusicFilterSection({
    draft,
    onSetShortAudio,
    onSetMinSize,
}: {
    draft: ScanSettings;
    onSetShortAudio: (on: boolean) => void;
    onSetMinSize: (bytes: number) => void;
}) {
    const t = useT();
    const sizeLabel = (bytes: number): string =>
        bytes === 0
            ? t('scanSettings.filter.sizeUnlimited')
            : t('scanSettings.filter.sizeMb', { size: bytes / MB });

    const pickMinSize = useCallback(() => {
        showActionSheetPanel({
            title: t('scanSettings.filter.minSize'),
            items: MIN_SIZE_CHOICES.map(bytes => ({
                label:
                    bytes === 0
                        ? t('scanSettings.filter.sizeUnlimited')
                        : t('scanSettings.filter.sizeMb', { size: bytes / MB }),
                selected: draft.minSizeBytes === bytes,
                onPress: () => onSetMinSize(bytes),
            })),
        });
    }, [t, draft.minSizeBytes, onSetMinSize]);

    return (
        <Section title={t('scanSettings.filter.section')}>
            <ListItem
                title={<Text>{t('scanSettings.filter.shortAudio')}</Text>}
                subtitle={
                    <Text size="sm" color="textSecondary">
                        {t('scanSettings.filter.shortAudioHint')}
                    </Text>
                }
                trailing={
                    <Switch
                        checked={draft.minDurationSec > 0}
                        onChange={onSetShortAudio}
                        // 整行已提供命中区，开关不必再撑 44 壳
                        dense
                        accessibilityLabel={t('scanSettings.filter.shortAudio')}
                    />
                }
                // 尾部走 inline 进入行主体 Pressable，整行无死角可点；
                // 点开关由它自己接、点别处由行接，响应者只会有一个，不会双翻转
                trailingInline
                onPress={() => onSetShortAudio(!(draft.minDurationSec > 0))}
                accessibilityLabel={t('scanSettings.filter.shortAudio')}
                accessibilityHint={t('scanSettings.filter.shortAudioHint')}
            />
            <ListItem
                title={<Text>{t('scanSettings.filter.minSize')}</Text>}
                subtitle={
                    <Text size="sm" color="textSecondary">
                        {t('scanSettings.filter.minSizeHint')}
                    </Text>
                }
                trailing={
                    <Text color="textSecondary">
                        {sizeLabel(draft.minSizeBytes)}
                    </Text>
                }
                trailingInline
                onPress={pickMinSize}
                accessibilityLabel={t('scanSettings.a11y.minSizeValue', {
                    value: sizeLabel(draft.minSizeBytes),
                })}
            />
        </Section>
    );
}
