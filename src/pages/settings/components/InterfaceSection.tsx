import { Section } from '@/components/ui/Section';
import { useT } from '@/i18n';

import { ChoiceRow, SwitchRow } from './SettingRows';

/** 界面分区：正在播放页的呈现偏好 */
export function InterfaceSection() {
    const t = useT();
    return (
        <Section title={t('settings.interface.section')}>
            <ChoiceRow
                configKey="musicDetail.defaultView"
                label={t('settings.interface.defaultView')}
                options={[
                    {
                        value: 'cover',
                        label: t('settings.interface.defaultViewOption.cover'),
                    },
                    {
                        value: 'lyric',
                        label: t('settings.interface.defaultViewOption.lyric'),
                    },
                ]}
            />
            <SwitchRow
                configKey="basic.musicDetailAwake"
                label={t('settings.interface.keepScreenAwake')}
            />
        </Section>
    );
}
