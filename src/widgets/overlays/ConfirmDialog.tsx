/**
 * 通用确认弹窗（组合内容，非壳/机制）：Promise 返回，结算靠 close
 * 右对齐按钮对：取消 ghost neutral / 确认 filled（primary・danger）——主动作给实底，破坏性操作才有足够视觉重量
 */
import { StyleSheet, View } from 'react-native';

import { defineDialog } from '@/components/overlay';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { space } from '@/design';
import { useT } from '@/i18n';

import type { OverlayProps } from '@/components/overlay';

export interface ConfirmOptions {
    title: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    /** 确认为破坏性操作（确认按钮用 danger 色） */
    danger?: boolean;
}

function ConfirmDialogView({
    payload,
    close,
}: OverlayProps<ConfirmOptions, boolean>) {
    const t = useT();
    return (
        <View>
            <Text size="xl" weight="bold" lineHeight="tight">
                {payload.title}
            </Text>
            {payload.message ? (
                <Text
                    color="textSecondary"
                    lineHeight="normal"
                    style={styles.message}
                >
                    {payload.message}
                </Text>
            ) : null}
            <View style={styles.actions}>
                <Button
                    variant="ghost"
                    tone="neutral"
                    onPress={() => close(false)}
                >
                    {payload.cancelText ?? t('common.cancel')}
                </Button>
                <Button
                    tone={payload.danger ? 'danger' : 'primary'}
                    onPress={() => close(true)}
                >
                    {payload.confirmText ?? t('common.confirm')}
                </Button>
            </View>
        </View>
    );
}

/** 确认框：`const ok = await showConfirmDialog({...})`；取消/返回键/backdrop → undefined（falsy） */
export const showConfirmDialog = defineDialog(ConfirmDialogView);

const styles = StyleSheet.create({
    // 标题与正文是同一语块，间距小于语块到动作区的距离
    message: {
        marginTop: space.sm,
    },
    actions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        // 两个按钮合计放不下（长翻译 / 窄屏 / 分屏）时换行堆叠；单个标签过长不在此列，Button 标签固定单行
        flexWrap: 'wrap',
        gap: space.sm,
        marginTop: space.xl,
    },
});
