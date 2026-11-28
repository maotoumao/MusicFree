/**
 * 定时关闭在各处入口行尾部显示的当前状态：倒计时显剩余时间、等待中显「定时已到」、未开启不显
 *
 * 独立于面板：抽屉、单曲「更多」面板等入口都要它，而它们不该反过来依赖面板模块
 * 倒计时期间每秒变化，调用方应把它关在只含这一行的小组件里，
 * 别让整张菜单 / 抽屉跟着每秒重渲
 */
import { useSleepRemainingSeconds, useSleepSchedule } from '@/core/sleepTimer';
import { useT } from '@/i18n';
import { formatDurationLabel } from '@/utils/time';

export function useSleepTimerSummary(): string | undefined {
    const t = useT();
    const schedule = useSleepSchedule();
    const remaining = useSleepRemainingSeconds();
    if (schedule.kind === 'off') {
        return undefined;
    }
    return schedule.kind === 'awaitingCurrentEnd'
        ? t('sleepTimerPanel.expiredTitle')
        : formatDurationLabel(remaining ?? 0);
}
