import { useAtom } from 'jotai';
import { useEffect, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBar } from '@/components/layout/AppBar';
import { PaperPane } from '@/components/layout/PaperPane';
import { Screen } from '@/components/layout/Screen';
import { ChipRow } from '@/components/ui/ChipRow';
import { useDownloadedCount, useDownloadSummary } from '@/core/download';
import { useCurrentMusic } from '@/core/player';
import { useBackAction } from '@/hooks/useBackAction';
import { useT } from '@/i18n';
import { MusicBar } from '@/widgets/MusicBar';

import { showDownloadOverflowMenu } from './actions';
import { ActiveDownloadPane } from './components/ActiveDownloadPane';
import { CompletedDownloadPane } from './components/CompletedDownloadPane';
import { selectedPaneAtom } from './store';

import type { DownloadPane } from './store';

/**
 * 下载管理页：摘要 + 四个筛选面（进行中 / 排队中 / 失败 / 已完成）
 *
 * 页面只做装配与筛选切换；每个面各自订阅自己的数据，看不见的面不产生开销
 */
export default function DownloadManagerScreen() {
    const t = useT();
    const back = useBackAction();
    const insets = useSafeAreaInsets();
    const current = useCurrentMusic();

    const summary = useDownloadSummary();
    const completedCount = useDownloadedCount();
    const [selected, setSelected] = useAtom(selectedPaneAtom);

    // 首次进入落到「最需要处理的非空状态」，**落定即写回**：
    // 每次渲染现算的话，最后一首下完就会把用户正看着的面切走
    useEffect(() => {
        if (selected !== undefined) return;
        setSelected(
            summary.inProgress > 0
                ? 'inProgress'
                : summary.failed > 0
                ? 'failed'
                : summary.queued > 0
                ? 'queued'
                : 'completed',
        );
    }, [selected, setSelected, summary]);

    const pane = selected ?? 'inProgress';

    const chips = useMemo(
        () => [
            {
                key: 'inProgress',
                label: t('downloadManager.filter.inProgress', {
                    count: summary.inProgress,
                }),
            },
            {
                key: 'queued',
                label: t('downloadManager.filter.queued', {
                    count: summary.queued,
                }),
            },
            {
                key: 'failed',
                label: t('downloadManager.filter.failed', {
                    count: summary.failed,
                }),
            },
            {
                key: 'completed',
                label: t('downloadManager.filter.completed', {
                    count: completedCount,
                }),
            },
        ],
        [t, summary, completedCount],
    );

    // MusicBar 在场时它承接底部安全区；缺席时列表自让出，避免最后一条落进系统手势区
    const listContentStyle = useMemo(
        () => ({ paddingBottom: current ? 0 : insets.bottom }),
        [current, insets.bottom],
    );

    // 一条任务都没时三个全局动作全不适用，此时连 `⋮` 一并不给，不摆一个点开是空的菜单
    const hasActiveTask =
        summary.inProgress + summary.queued + summary.failed > 0;
    const overflow = useMemo(
        () =>
            hasActiveTask
                ? { onPress: () => showDownloadOverflowMenu(summary) }
                : undefined,
        [hasActiveTask, summary],
    );

    return (
        <Screen edges={[]}>
            <AppBar
                title={t('downloadManager.title')}
                leading={back}
                overflow={overflow}
                contentWidth="list"
            />
            <PaperPane width="list">
                <ChipRow
                    items={chips}
                    activeKey={pane}
                    onSelect={key => setSelected(key as DownloadPane)}
                />
                {pane === 'completed' ? (
                    <CompletedDownloadPane
                        contentContainerStyle={listContentStyle}
                    />
                ) : (
                    // key 让每个筛选面各自持有列表实例，切换回来时不继承上一面的滚动位置
                    <ActiveDownloadPane
                        key={pane}
                        filter={pane}
                        contentContainerStyle={listContentStyle}
                    />
                )}
            </PaperPane>
            <MusicBar />
        </Screen>
    );
}
