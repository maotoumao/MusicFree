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

/** 排除目录区：列出已排除目录（可移除）+ 添加；全盘 / 指定模式都生效 */
export function ExcludedDirSection({
    draft,
    onAddDir,
    onRemoveDir,
}: {
    draft: ScanSettings;
    onAddDir: () => void;
    onRemoveDir: (path: string) => void;
}) {
    const t = useT();
    return (
        <Section title={t('scanSettings.excluded.section')}>
            {draft.excludedDirs.length === 0 ? (
                <Text size="sm" color="textSecondary" style={styles.empty}>
                    {t('scanSettings.excluded.empty')}
                </Text>
            ) : (
                draft.excludedDirs.map(path => (
                    <ListItem
                        key={path}
                        leading={
                            <Icon
                                size="sm"
                                name="folder-open"
                                color="textSecondary"
                            />
                        }
                        title={
                            <Text size="sm" numberOfLines={1}>
                                {path}
                            </Text>
                        }
                        subtitle={
                            <Text size="xs" color="textSecondary">
                                {t('scanSettings.excluded.itemHint')}
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
                ))
            )}
            <View style={styles.addRow}>
                <Button variant="outline" icon="folder-plus" onPress={onAddDir}>
                    {t('scanSettings.excluded.addDir')}
                </Button>
            </View>
        </Section>
    );
}

const styles = StyleSheet.create({
    empty: {
        paddingHorizontal: space.lg,
        paddingBottom: space.sm,
    },
    addRow: {
        paddingHorizontal: space.lg,
        paddingTop: space.sm,
    },
});
