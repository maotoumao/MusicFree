import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ContentColumn } from '@/components/layout/ContentColumn';
import { showToast } from '@/components/overlay';
import { LabeledIconButton } from '@/components/ui/LabeledIconButton';
import { borderWidth, space, useColors } from '@/design';
import { t } from '@/i18n';

import type { BatchAction, BatchOutcome } from '../lib/sources';
import type { MusicItem } from '@/types';

/**
 * 底部批量操作条：常驻页面底部、随选择态可用
 * 未选中时整排禁用；动作自身 disabled（能力未就绪）恒禁用
 * 执行期间整排上锁（single-flight），结算只认发起时的选中快照
 */
export function SelectionActionBar({
    actions,
    selectedItems,
    onExecuted,
}: {
    actions: readonly BatchAction[];
    selectedItems: readonly MusicItem[];
    /** 动作执行完毕；outcome 由动作自身给出 */
    onExecuted: (outcome: BatchOutcome) => void;
}) {
    const colors = useColors();
    const insets = useSafeAreaInsets();
    // 正在执行的动作 label；非空即整排上锁，该格显示 spinner
    const [runningLabel, setRunningLabel] = useState<string | null>(null);
    const nothingSelected = selectedItems.length === 0;
    const run = (action: BatchAction) => {
        if (runningLabel !== null) {
            return;
        }
        setRunningLabel(action.label);
        // 结算用发起时的快照：执行期间用户改选区也不影响本次结果
        action
            .execute(selectedItems)
            .then(onExecuted)
            .catch(() =>
                showToast(t('feedback.operationFailed'), { type: 'error' }),
            )
            .finally(() => setRunningLabel(null));
    };
    return (
        <View
            style={[
                styles.bar,
                {
                    paddingBottom: insets.bottom,
                    backgroundColor: colors.surface,
                    borderTopColor: colors.border,
                },
            ]}
        >
            {/* 操作条通栏铺色，动作收进与列表同一内容列（平板）；手机 ContentColumn 原样返回 */}
            <ContentColumn kind="list" style={styles.actions}>
                {actions.map(action => (
                    <LabeledIconButton
                        key={action.label}
                        icon={action.icon}
                        label={action.label}
                        tone={action.danger ? 'danger' : 'text'}
                        disabled={
                            nothingSelected ||
                            runningLabel !== null ||
                            (action.disabled ?? false)
                        }
                        busy={runningLabel === action.label}
                        onPress={() => run(action)}
                    />
                ))}
            </ContentColumn>
        </View>
    );
}

const styles = StyleSheet.create({
    bar: {
        flexDirection: 'row',
        paddingHorizontal: space.md,
        borderTopWidth: borderWidth.hairline,
    },
    /** 平板才渲染的内容列容器：横向排动作、占满条宽再限宽居中 */
    actions: {
        flex: 1,
        flexDirection: 'row',
    },
});
