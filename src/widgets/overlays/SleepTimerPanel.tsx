/**
 * 定时关闭面板（底部 Panel）：两个正交维度，两种控件
 * · 触发（多久之后停）＝单选列表
 * · 策略（要不要切断正在播的这首）＝ Switch
 * 任何操作都不收面板：定时是要来回比划的设置，只能由用户自己关
 *
 * 头部一栏三态：未激活 / 倒计时（右侧带顺延按钮）/ 已到点，共用同一个最小高度
 */
import { ScrollView, StyleSheet, View } from 'react-native';

import { definePanel, showToast } from '@/components/overlay';
import { Button } from '@/components/ui/Button';
import { PanelRadioRow } from '@/components/ui/PanelRadioRow';
import { Switch } from '@/components/ui/Switch';
import { Text } from '@/components/ui/Text';
import { useConfig } from '@/core/config';
import {
    SLEEP_TIMER_MAX_MINUTES,
    SLEEP_TIMER_MIN_MINUTES,
    sleepTimer,
    useSleepRemainingSeconds,
    useSleepSchedule,
} from '@/core/sleepTimer';
import { borderWidth, space, useColors } from '@/design';
import { Trans, useT } from '@/i18n';
import { formatDurationLabel } from '@/utils/time';
import { showTextPromptPanel } from '@/widgets/overlays/TextPromptPanel';

import type { OverlayProps } from '@/components/overlay';
import type { SleepSchedule } from '@/core/sleepTimer';
import type { ReactNode } from 'react';

/** 时长档（分钟）：入睡通常 15–30 分钟；90 分钟＝一个睡眠周期 */
const PRESET_MINUTES = [15, 30, 60, 90] as const;

/** 「+N 分钟」的增量 */
const EXTEND_MINUTES = 10;

/**
 * 头部文案块的高度下限（dp）：三态里最矮的一态也占满，切状态时标题不上下跳
 * 只压下限不封死上限——英文副文案换行时宁可长一点，也好过截断
 */
const HEAD_COPY_MIN_HEIGHT = 50;

/** 副文案封顶行数：再长也不该把头部撑到喧宾夺主 */
const SUBTITLE_LINES = 2;

/** 自定义时长的边界文案参数：与 core 常量同源，避免文案里硬编码后漂移 */
const RANGE_PARAMS = {
    min: SLEEP_TIMER_MIN_MINUTES,
    max: SLEEP_TIMER_MAX_MINUTES,
    maxHours: SLEEP_TIMER_MAX_MINUTES / 60,
};

/** 「{time} 后停止」里那段大号数字；提到组件外，避免每次 render 造新组件类型 */
const STOPS_IN_TAGS = {
    time: (children: ReactNode) => (
        <Text size="2xl" weight="bold">
            {children}
        </Text>
    ),
};

type Translate = ReturnType<typeof useT>;

/** 分钟数 → 口语化时长（90 → 「1 小时 30 分钟」），供 toast 与「上次」回显 */
function spokenDuration(t: Translate, minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours === 0) {
        return t('sleepTimerPanel.minutes', { count: rest });
    }
    if (rest === 0) {
        return t('sleepTimerPanel.hours', { count: hours });
    }
    return t('sleepTimerPanel.hoursMinutes', {
        hours: String(hours),
        minutes: String(rest),
    });
}

/** 当前安排选中的档；未激活或选了自定义值则不匹配任何预设 */
function selectedMinutes(schedule: SleepSchedule): number | null {
    return schedule.kind === 'off' ? null : schedule.minutes;
}

/**
 * 倒计时行：单独成组件，让每秒变化只重渲这一行
 * 放在面板根组件会带着六个选项行与 Switch 一起每秒重渲
 */
function CountdownLine() {
    const remaining = useSleepRemainingSeconds();
    return (
        <Text style={styles.live}>
            <Trans
                k="sleepTimerPanel.stopsIn"
                values={{ time: formatDurationLabel(remaining ?? 0) }}
                tags={STOPS_IN_TAGS}
            />
        </Text>
    );
}

function SleepTimerPanelView(_: OverlayProps<void, void>) {
    const t = useT();
    const colors = useColors();
    const schedule = useSleepSchedule();
    // 偏好真相源在 config：直接订阅 MMKV，不在 core 里镜像
    const waitForCurrentEnd = useConfig('sleepTimer.waitForCurrentEnd') ?? true;
    const lastCustom = sleepTimer.getLastCustomMinutes();

    const counting = schedule.kind === 'countdown';
    const expired = schedule.kind === 'awaitingCurrentEnd';
    const picked = selectedMinutes(schedule);
    // 选中值不在预设表里 = 走的自定义（同值输入按预设记，radio 表达的是有效值而非来源）
    const customSelected =
        picked !== null &&
        !PRESET_MINUTES.includes(picked as (typeof PRESET_MINUTES)[number]);

    // 以下操作一律不收面板：定时是要来回比划的设置，点一下就关会逼用户反复重开
    // 结果也无需 toast——头部实时反映新状态，比浮层提示更直接
    const start = (minutes: number) => {
        sleepTimer.start(minutes);
    };

    const turnOff = () => {
        sleepTimer.cancel();
    };

    const extend = () => {
        // 余量不够完整顺延时命令整笔拒绝；此时头部数字不动，若静默按钮看着像失灵
        if (!sleepTimer.extend(EXTEND_MINUTES)) {
            showToast(
                t('sleepTimerPanel.extendCapped', {
                    duration: spokenDuration(t, SLEEP_TIMER_MAX_MINUTES),
                }),
            );
        }
    };

    /**
     * 自定义：复用既有文本提交面板（数字键盘 / 预填全选 / 键盘避让 / {ok:false} 留面板重试都是现成的）
     * 作为子流程打开，取消或确认都回到本面板
     */
    const openCustom = async () => {
        const minutes = await showTextPromptPanel<number>({
            title: t('sleepTimerPanel.customTitle'),
            message: t('sleepTimerPanel.customMessage', RANGE_PARAMS),
            placeholder: t('sleepTimerPanel.customPlaceholder'),
            inputMode: 'numeric',
            defaultValue: lastCustom !== undefined ? String(lastCustom) : '',
            selectTextOnFocus: true,
            onSubmit: async value => {
                const input = Number(value.trim());
                if (
                    !Number.isInteger(input) ||
                    input < SLEEP_TIMER_MIN_MINUTES ||
                    input > SLEEP_TIMER_MAX_MINUTES
                ) {
                    showToast(
                        t('sleepTimerPanel.customInvalid', RANGE_PARAMS),
                        { type: 'error' },
                    );
                    return { ok: false }; // 留在输入面板原地改
                }
                return { ok: true, result: input };
            },
        });
        if (minutes === undefined) {
            return; // 取消 / 返回键：留在本面板
        }
        sleepTimer.rememberCustomMinutes(minutes);
        start(minutes);
    };

    return (
        <View style={styles.root}>
            <View style={[styles.head, { borderBottomColor: colors.border }]}>
                <View style={styles.headCopy}>
                    {counting ? (
                        <>
                            <Text size="sm" color="textSecondary">
                                {t('sleepTimerPanel.title')}
                            </Text>
                            <CountdownLine />
                        </>
                    ) : (
                        <>
                            <Text size="xl" weight="bold" lineHeight="tight">
                                {expired
                                    ? t('sleepTimerPanel.expiredTitle')
                                    : t('sleepTimerPanel.title')}
                            </Text>
                            <Text
                                size="sm"
                                color="textSecondary"
                                lineHeight="normal"
                                numberOfLines={SUBTITLE_LINES}
                                style={styles.subtitle}
                            >
                                {expired
                                    ? t('sleepTimerPanel.expiredHint')
                                    : t('sleepTimerPanel.subtitle')}
                            </Text>
                        </>
                    )}
                </View>
                {/* 顺延只在倒计时中有意义，贴着大号数字右侧、与其底沿对齐 */}
                {counting ? (
                    <Button size="sm" variant="outline" onPress={extend}>
                        {t('sleepTimerPanel.extend', { count: EXTEND_MINUTES })}
                    </Button>
                ) : null}
            </View>

            <ScrollView style={styles.body}>
                <View
                    accessibilityRole="radiogroup"
                    accessibilityLabel={t('sleepTimerPanel.a11y.durationGroup')}
                >
                    <PanelRadioRow
                        label={t('sleepTimerPanel.off')}
                        selected={schedule.kind === 'off'}
                        onPress={turnOff}
                    />
                    {PRESET_MINUTES.map(minutes => (
                        <PanelRadioRow
                            key={minutes}
                            label={t('sleepTimerPanel.minutes', {
                                count: minutes,
                            })}
                            selected={picked === minutes}
                            onPress={() => start(minutes)}
                        />
                    ))}
                    <PanelRadioRow
                        label={t('sleepTimerPanel.custom')}
                        value={
                            lastCustom !== undefined && !customSelected
                                ? t('sleepTimerPanel.lastCustom', {
                                      duration: spokenDuration(t, lastCustom),
                                  })
                                : undefined
                        }
                        selected={customSelected}
                        onPress={openCustom}
                    />
                </View>
            </ScrollView>

            <View style={[styles.switchRow, { borderTopColor: colors.border }]}>
                <View style={styles.switchMain}>
                    <Text style={styles.switchLabel}>
                        {t('sleepTimerPanel.waitForCurrentEnd')}
                    </Text>
                    <Switch
                        checked={waitForCurrentEnd}
                        onChange={next => sleepTimer.setWaitForCurrentEnd(next)}
                        accessibilityLabel={t(
                            'sleepTimerPanel.waitForCurrentEnd',
                        )}
                    />
                </View>
                {/* 说明描述整行、不该被开关的列宽挤，故独占全宽放在下方 */}
                <Text size="sm" color="textSecondary" style={styles.switchHint}>
                    {t('sleepTimerPanel.waitForCurrentEndHint')}
                </Text>
            </View>
        </View>
    );
}

/** 定时关闭面板：`showSleepTimerPanel()` */
export const showSleepTimerPanel = definePanel<void, void>(SleepTimerPanelView);

const styles = StyleSheet.create({
    root: {
        flexGrow: 1,
        flexShrink: 1,
    },
    head: {
        flexDirection: 'row',
        // 底沿对齐：顺延按钮贴着倒计时大号数字的基线一侧，不被文案块的高度顶起来
        alignItems: 'flex-end',
        gap: space.md,
        paddingHorizontal: space.lg,
        // 顶部不留白：Panel 壳的抓手已经给了呼吸区，再加就是一节空档
        paddingBottom: space.lg,
        borderBottomWidth: borderWidth.hairline,
    },
    headCopy: {
        flex: 1,
        minWidth: 0,
        // 三态文案行数不同，撑住下限让切状态时标题不上下跳
        minHeight: HEAD_COPY_MIN_HEIGHT,
        justifyContent: 'flex-end',
    },
    subtitle: {
        marginTop: space.xs,
    },
    live: {
        marginTop: 2,
    },
    body: {
        flexGrow: 1,
        flexShrink: 1,
    },
    switchRow: {
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        borderTopWidth: borderWidth.hairline,
    },
    switchMain: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.lg,
        minHeight: 32,
    },
    switchLabel: {
        flex: 1,
    },
    switchHint: {
        marginTop: space.xs,
    },
});
