import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ContentColumn } from '@/components/layout/ContentColumn';
import { showToast } from '@/components/overlay';
import { LabeledIconButton } from '@/components/ui/LabeledIconButton';
import { borderWidth, space, useColors } from '@/design';
import { t } from '@/i18n';

import type { PlaylistEditorAction } from '../lib/sources';

/**
 * 底部批量操作条：本页只有一个动作（删除歌单 / 取消收藏），呈现由 source 描述
 * 未选中时禁用；执行期间上锁并显示 spinner
 */
export function SelectionActionBar({
    action,
    disabled,
    onPress,
    onApplied,
}: {
    action: PlaylistEditorAction;
    disabled: boolean;
    /** 执行动作；true = 已生效，false = 取消或未执行 */
    onPress: () => Promise<boolean>;
    /** 动作生效后调用 */
    onApplied: () => void;
}) {
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const [pending, setPending] = useState(false);
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
                <LabeledIconButton
                    icon={action.icon}
                    label={t(action.labelKey)}
                    tone={action.danger ? 'danger' : 'text'}
                    disabled={disabled || pending}
                    busy={pending}
                    onPress={() => {
                        if (pending) {
                            return;
                        }
                        setPending(true);
                        onPress()
                            .then(applied => {
                                if (applied) {
                                    onApplied();
                                }
                            })
                            .catch(() =>
                                showToast(t('feedback.operationFailed'), {
                                    type: 'error',
                                }),
                            )
                            .finally(() => setPending(false));
                    }}
                />
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
