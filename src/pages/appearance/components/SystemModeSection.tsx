import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { ListItem } from '@/components/ui/ListItem';
import { Switch } from '@/components/ui/Switch';
import { Text } from '@/components/ui/Text';
import { space } from '@/design';
import { useT } from '@/i18n';

import { themePackName } from '../lib/themePackName';

import type { ThemePack, ThemeSelection } from '@/core/theme';

interface SystemModeSectionProps {
    packs: readonly ThemePack[];
    selection: ThemeSelection;
    onToggleFollowSystem(follow: boolean): void;
    onPickSlot(slot: 'day' | 'night'): void;
}

/**
 * 模式区：一个「跟随系统」开关；打开后展开日间 / 夜间两行，各自绑定一套主题
 * 关闭时当前主题由上方网格直接点选，故这里不再重复一行「固定使用」
 */
function SystemModeSection({
    packs,
    selection,
    onToggleFollowSystem,
    onPickSlot,
}: SystemModeSectionProps) {
    const t = useT();
    const follow = selection.kind === 'system';
    return (
        <View>
            <ListItem
                title={<Text>{t('appearance.mode.followSystem')}</Text>}
                subtitle={
                    <Text size="sm" color="textSecondary">
                        {t('appearance.mode.followSystemHint')}
                    </Text>
                }
                trailing={
                    <Switch
                        checked={follow}
                        onChange={onToggleFollowSystem}
                        accessibilityLabel={t('appearance.mode.followSystem')}
                    />
                }
            />
            {selection.kind === 'system' ? (
                <>
                    <SlotRow
                        label={t('appearance.mode.dayTheme')}
                        packs={packs}
                        packId={selection.dayPackId}
                        onPress={() => onPickSlot('day')}
                    />
                    <SlotRow
                        label={t('appearance.mode.nightTheme')}
                        packs={packs}
                        packId={selection.nightPackId}
                        onPress={() => onPickSlot('night')}
                    />
                </>
            ) : null}
        </View>
    );
}

/** 单个时段槽位：显示当前绑定的主题名，整行点开主题选择菜单 */
function SlotRow({
    label,
    packs,
    packId,
    onPress,
}: {
    label: string;
    packs: readonly ThemePack[];
    packId: string;
    onPress: () => void;
}) {
    const t = useT();
    const pack = packs.find(item => item.id === packId);
    const name = pack ? themePackName(pack, t) : '';
    return (
        <ListItem
            title={<Text>{label}</Text>}
            trailing={
                <View style={styles.trailing}>
                    <Text size="sm" color="textSecondary" numberOfLines={1}>
                        {name}
                    </Text>
                    <Icon name="chevron-right" size="md" color="textDisabled" />
                </View>
            }
            trailingInline
            onPress={onPress}
            accessibilityLabel={`${label} ${name}`}
            accessibilityHint={t('appearance.a11y.pickSlotTheme')}
        />
    );
}

const styles = StyleSheet.create({
    trailing: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        flexShrink: 1,
    },
});

export { SystemModeSection };
