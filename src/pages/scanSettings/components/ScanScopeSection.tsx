import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { ListItem } from '@/components/ui/ListItem';
import { Section } from '@/components/ui/Section';
import { Text } from '@/components/ui/Text';
import { space } from '@/design';
import { useT } from '@/i18n';

import type { ScanSettings } from '@/core/localMusic';

/** 扫描范围区：全盘 / 指定 单选；指定模式列出已加扫描目录（可移除）+ 添加 */
export function ScanScopeSection({
    draft,
    onSetMode,
    onAddDir,
    onRemoveDir,
}: {
    draft: ScanSettings;
    onSetMode: (mode: ScanSettings['mode']) => void;
    onAddDir: () => void;
    onRemoveDir: (path: string) => void;
}) {
    const t = useT();
    const isCustom = draft.mode === 'custom';
    return (
        <Section title={t('scanSettings.scope.section')}>
            <ListItem
                selected={draft.mode === 'all'}
                title={<Text>{t('scanSettings.scope.all')}</Text>}
                subtitle={
                    <Text size="sm" color="textSecondary">
                        {t('scanSettings.scope.allHint')}
                    </Text>
                }
                trailing={
                    draft.mode === 'all' ? (
                        <Icon name="check" color="primary" />
                    ) : undefined
                }
                trailingInline
                onPress={() => onSetMode('all')}
                accessibilityLabel={t('scanSettings.scope.all')}
            />
            <ListItem
                selected={isCustom}
                title={<Text>{t('scanSettings.scope.custom')}</Text>}
                subtitle={
                    <Text size="sm" color="textSecondary">
                        {draft.includedDirs.length > 0
                            ? t('scanSettings.scope.customHint', {
                                  count: draft.includedDirs.length,
                              })
                            : t('scanSettings.scope.customEmptyHint')}
                    </Text>
                }
                trailing={
                    isCustom ? <Icon name="check" color="primary" /> : undefined
                }
                trailingInline
                onPress={() => onSetMode('custom')}
                accessibilityLabel={t('scanSettings.scope.custom')}
            />
            {isCustom ? (
                <>
                    {draft.includedDirs.map(path => (
                        <ListItem
                            key={path}
                            leading={
                                <Icon
                                    name="folder-open"
                                    color="textSecondary"
                                    size="sm"
                                />
                            }
                            title={
                                <Text size="sm" numberOfLines={1}>
                                    {path}
                                </Text>
                            }
                            trailing={
                                <IconButton
                                    icon="x"
                                    size="sm"
                                    tone="textSecondary"
                                    edgeAlign="end"
                                    onPress={() => onRemoveDir(path)}
                                    accessibilityLabel={t(
                                        'scanSettings.a11y.removeDir',
                                        { name: path },
                                    )}
                                />
                            }
                        />
                    ))}
                    <View style={styles.addRow}>
                        <Button
                            variant="outline"
                            icon="folder-plus"
                            onPress={onAddDir}
                        >
                            {t('scanSettings.scope.addDir')}
                        </Button>
                    </View>
                </>
            ) : null}
        </Section>
    );
}

const styles = StyleSheet.create({
    addRow: {
        paddingHorizontal: space.lg,
        paddingTop: space.sm,
    },
});
