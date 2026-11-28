import { useNavigation } from '@react-navigation/native';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { IconButton, iconButtonEdgeInset } from '@/components/ui/IconButton';
import { Tabs } from '@/components/ui/Tabs';
import { layout } from '@/design';
import { useT } from '@/i18n';
import { showActionSheetPanel } from '@/widgets/overlays/ActionSheetPanel';
import { promptImportMediaFromPlugins } from '@/widgets/overlays/importMedia';

export type PlaylistTab = 'local' | 'starred';

/** 歌单区头：本地 / 收藏 Tab + 新建 + 导入菜单；Tab 受控，当前态由 home 页持有 */
export function PlaylistTabs({
    tab,
    onTab,
    onCreate,
}: {
    tab: PlaylistTab;
    onTab: (tab: PlaylistTab) => void;
    onCreate: () => void;
}) {
    const t = useT();
    const navigation = useNavigation();
    // ⋮ 菜单：批量管理（进歌单管理页，带当前 tab）+ 导入
    const openOverflowMenu = useCallback(() => {
        showActionSheetPanel({
            items: [
                {
                    icon: 'list-checks',
                    label: t('home.playlists.batchManage'),
                    onPress: () =>
                        navigation.navigate('PlaylistEditor', { tab }),
                },
                {
                    icon: 'import',
                    label: t('importMedia.music'),
                    separatorBefore: true,
                    onPress: () => promptImportMediaFromPlugins('music'),
                },
                {
                    icon: 'import',
                    label: t('importMedia.playlist'),
                    onPress: () => promptImportMediaFromPlugins('playlist'),
                },
            ],
        });
    }, [t, tab, navigation]);
    return (
        <View style={styles.head}>
            <Tabs
                align="start"
                items={[
                    { key: 'local', label: t('home.playlists.local') },
                    { key: 'starred', label: t('home.playlists.starred') },
                ]}
                value={tab}
                onChange={onTab}
            />
            <View style={styles.actions}>
                <IconButton
                    icon="plus"
                    accessibilityLabel={t('home.a11y.createPlaylist')}
                    onPress={onCreate}
                />
                <IconButton
                    icon="ellipsis-vertical"
                    accessibilityLabel={t('common.more')}
                    onPress={openOverflowMenu}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    head: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: layout.screenGutter,
        paddingRight: iconButtonEdgeInset(layout.screenGutter),
    },
    actions: {
        flexDirection: 'row',
        alignItems: 'center',
    },
});
