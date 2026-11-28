import { useNavigation } from '@react-navigation/native';
import { useCallback, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBar } from '@/components/layout/AppBar';
import { PaperPane } from '@/components/layout/PaperPane';
import { Screen } from '@/components/layout/Screen';
import { ContentUnavailable } from '@/components/ui/ContentUnavailable';
import { history, useHistory } from '@/core/history';
import { useCurrentMusic } from '@/core/player';
import { useBackAction } from '@/hooks/useBackAction';
import { useContentColumn } from '@/hooks/useContentColumn';
import { useT } from '@/i18n';
import { stash } from '@/infra/stash';
import { mediaKey } from '@/utils/media';
import { MusicBar } from '@/widgets/MusicBar';
import { MusicRow } from '@/widgets/MusicRow';
import { showActionSheetPanel } from '@/widgets/overlays/ActionSheetPanel';
import { showConfirmDialog } from '@/widgets/overlays/ConfirmDialog';
import { showMusicItemOptionsPanel } from '@/widgets/overlays/MusicItemOptionsPanel';

import type { MusicItem } from '@/types';

/** 最近播放页：完整播放历史（newest-first），逐条移除或整体清空；数据与清除归 history core */
export default function HistoryScreen() {
    const t = useT();
    const back = useBackAction();
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const current = useCurrentMusic();
    const items = useHistory();

    // MusicBar 在场时它承接底部安全区；缺席时列表自让出，避免最后一条落进系统手势区
    const listContentStyle = useMemo(
        () => ({ paddingBottom: current ? 0 : insets.bottom }),
        [current, insets.bottom],
    );
    // 平板：行收进媒体行内容列（手机 undefined，contentContainerStyle 原样）
    const column = useContentColumn('list');
    const baseContentStyle =
        items.length === 0 ? styles.emptyContent : listContentStyle;
    const contentContainerStyle = column
        ? [baseContentStyle, column]
        : baseContentStyle;

    // 清空走确认弹窗（danger 确认按钮 + 明确文案），确认前不动历史
    const confirmClear = useCallback(() => {
        showConfirmDialog({
            title: t('history.clearConfirm.title'),
            message: t('history.clearConfirm.message'),
            confirmText: t('history.clear'),
            danger: true,
        })
            .then(ok => {
                if (ok) {
                    history.clear();
                }
            })
            .catch(() => {});
    }, [t]);

    // 条目级更多：打开单曲「更多」面板（source=history → 含「从历史移除」）
    const openItemMenu = useCallback((item: MusicItem) => {
        showMusicItemOptionsPanel({
            item,
            source: { kind: 'history' },
        });
    }, []);

    // 历史内搜索：列表快照含插件私有字段、不可靠序列化 → 存 stash 只传 ticket
    const openSearch = useCallback(() => {
        const ticket = stash({
            musicList: [...items],
            itemOptionsSource: { kind: 'history' },
            title: t('history.title'),
        });
        navigation.navigate('SearchInList', { ticket });
    }, [items, t, navigation]);

    // 页面级溢出菜单：多选 / 清空（不传 title）
    const openOverflowMenu = useCallback(() => {
        showActionSheetPanel({
            items: [
                {
                    icon: 'list-checks',
                    label: t('history.batchManage'),
                    onPress: () =>
                        navigation.navigate('MusicSelection', {
                            kind: 'history',
                        }),
                },
                {
                    icon: 'trash-2',
                    label: t('history.clearAll'),
                    danger: true,
                    onPress: confirmClear,
                },
            ],
        });
    }, [t, navigation, confirmClear]);

    const renderItem = useCallback(
        ({ item }: { item: MusicItem }) => (
            <MusicRow item={item} onMore={openItemMenu} />
        ),
        [openItemMenu],
    );

    return (
        <Screen edges={[]}>
            <AppBar
                title={t('history.title')}
                leading={back}
                contentWidth="list"
                actions={
                    items.length > 0
                        ? [
                              {
                                  icon: 'search',
                                  label: t('common.search'),
                                  onPress: openSearch,
                              },
                          ]
                        : undefined
                }
                overflow={
                    items.length > 0 ? { onPress: openOverflowMenu } : undefined
                }
            />
            <PaperPane width="list">
                <Animated.FlatList
                    data={items}
                    style={styles.list}
                    keyExtractor={mediaKey}
                    renderItem={renderItem}
                    itemLayoutAnimation={LinearTransition}
                    ListEmptyComponent={
                        <ContentUnavailable
                            icon="history"
                            title={t('history.empty')}
                            style={styles.empty}
                        />
                    }
                    contentContainerStyle={contentContainerStyle}
                />
            </PaperPane>
            <MusicBar />
        </Screen>
    );
}

const styles = StyleSheet.create({
    list: {
        flex: 1,
    },
    // 空态占满内容区以便垂直居中
    empty: {
        flex: 1,
    },
    emptyContent: {
        flexGrow: 1,
    },
});
