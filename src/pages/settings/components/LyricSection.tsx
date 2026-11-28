import { Platform } from 'react-native';

import { Section } from '@/components/ui/Section';
import { useConfig } from '@/core/config';
import { floatingLyric } from '@/core/floatingLyric';
import { useT } from '@/i18n';
import { showFloatingLyricSettingsPanel } from '@/widgets/overlays/FloatingLyricSettingsPanel';

import { ActionRow, ControlledSwitchRow, SwitchRow } from './SettingRows';

import type { ReactElement } from 'react';

/**
 * 歌词分区：自动搜索是跨平台偏好；悬浮歌词两行仅 Android 显示
 */
export function LyricSection(): ReactElement {
    const t = useT();
    return (
        <Section title={t('settings.lyric.section')}>
            <SwitchRow
                configKey="lyric.autoSearchLyric"
                label={t('settings.lyric.autoSearch')}
                description={t('settings.lyric.autoSearchHint')}
            />
            {Platform.OS === 'android' ? <AndroidFloatingLyricRows /> : null}
        </Section>
    );
}

/** 悬浮歌词开启要先过系统权限，不能用一次 config.set 的普通 SwitchRow */
function AndroidFloatingLyricRows(): ReactElement {
    const t = useT();
    const enabled = useConfig('floatingLyric.enabled') ?? false;
    return (
        <>
            <ControlledSwitchRow
                label={t('settings.lyric.floatingLyric')}
                checked={enabled}
                onChange={next => {
                    if (next) {
                        // 无权限是正常分支：core 发引导事件、不落库，开关自然回弹到关
                        floatingLyric.enable().catch(e => {
                            if (__DEV__) {
                                console.warn('[settings] 开启悬浮歌词失败', e);
                            }
                        });
                    } else {
                        floatingLyric.disable();
                    }
                }}
            />
            <ActionRow
                label={t('settings.lyric.floatingLyricSettings')}
                onPress={() => showFloatingLyricSettingsPanel()}
            />
        </>
    );
}
