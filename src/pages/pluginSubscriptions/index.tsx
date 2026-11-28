import { FlashList } from '@shopify/flash-list';
import { StyleSheet } from 'react-native';

import { AppBar } from '@/components/layout/AppBar';
import { ContentColumn } from '@/components/layout/ContentColumn';
import { PaperPane } from '@/components/layout/PaperPane';
import { Screen } from '@/components/layout/Screen';
import { ContentUnavailable } from '@/components/ui/ContentUnavailable';
import { IconButton } from '@/components/ui/IconButton';
import { ListItem } from '@/components/ui/ListItem';
import { Text } from '@/components/ui/Text';
import { useBackAction } from '@/hooks/useBackAction';
import { useT } from '@/i18n';

import { useSubscriptionSources } from './hooks/useSubscriptionSources';

import type { SubscribeSource } from '@/core/plugin';

/** 订阅源管理页：列出订阅源，支持新增 / 编辑 / 删除 */
export default function PluginSubscriptionsScreen() {
    const t = useT();
    const back = useBackAction();
    const { sources, promptAdd, openRowMenu } = useSubscriptionSources();

    return (
        <Screen edges={['bottom']}>
            <AppBar
                title={t('pluginSubscriptions.title')}
                leading={back}
                contentWidth="list"
                actions={[
                    {
                        icon: 'plus',
                        label: t('pluginSubscriptions.a11y.add'),
                        onPress: promptAdd,
                    },
                ]}
            />
            {sources.length === 0 ? (
                <ContentUnavailable
                    icon="rss"
                    title={t('pluginSubscriptions.empty.title')}
                    description={t('pluginSubscriptions.empty.description')}
                    action={{
                        icon: 'plus',
                        label: t('pluginSubscriptions.empty.action'),
                        onPress: promptAdd,
                    }}
                    style={styles.empty}
                />
            ) : (
                <PaperPane width="list">
                    <FlashList
                        data={sources}
                        keyExtractor={(item, index) => `${index}:${item.url}`}
                        renderItem={({ item, index }) => (
                            <ContentColumn kind="list">
                                <SubscriptionRow
                                    source={item}
                                    onPress={() => openRowMenu(index)}
                                />
                            </ContentColumn>
                        )}
                    />
                </PaperPane>
            )}
        </Screen>
    );
}

/** 订阅源行：名称 + 地址（单行截断），点击行或 ⋮ 弹出编辑 / 删除菜单 */
function SubscriptionRow({
    source,
    onPress,
}: {
    source: SubscribeSource;
    onPress: () => void;
}) {
    const t = useT();
    return (
        <ListItem
            onPress={onPress}
            accessibilityLabel={source.name}
            title={
                <Text size="lg" weight="medium" numberOfLines={1}>
                    {source.name}
                </Text>
            }
            subtitle={
                <Text size="sm" color="textSecondary" numberOfLines={1}>
                    {source.url}
                </Text>
            }
            trailing={
                <IconButton
                    icon="ellipsis-vertical"
                    tone="textSecondary"
                    edgeAlign="end"
                    onPress={onPress}
                    accessibilityLabel={t('common.more')}
                />
            }
        />
    );
}

const styles = StyleSheet.create({
    empty: {
        flex: 1,
    },
});
