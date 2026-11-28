import { Section } from '@/components/ui/Section';
import { useT } from '@/i18n';

import { SwitchRow } from './SettingRows';

/**
 * 插件分区：只放插件的全局偏好，装卸 / 排序 / 订阅源等管理任务归插件管理页
 * 两道版本闸各管各的：一道管插件自身版本的新旧，一道管插件声明的 App 兼容范围
 */
export function PluginSection() {
    const t = useT();
    return (
        <Section title={t('settings.plugin.section')}>
            <SwitchRow
                configKey="basic.autoUpdatePlugin"
                label={t('settings.plugin.autoUpdate')}
                description={t('settings.plugin.autoUpdateHint')}
            />
            <SwitchRow
                configKey="basic.notCheckPluginVersion"
                label={t('settings.plugin.allowDowngrade')}
                description={t('settings.plugin.allowDowngradeHint')}
            />
            <SwitchRow
                configKey="plugin.ignoreAppVersion"
                label={t('settings.plugin.ignoreAppVersion')}
                description={t('settings.plugin.ignoreAppVersionHint')}
            />
        </Section>
    );
}
