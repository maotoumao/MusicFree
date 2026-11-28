/**
 * 通用提示弹窗（组合内容，非壳/机制）：单确认按钮，任意关闭路径都 settle
 * 右对齐 filled primary 按钮：单动作即主动作，ghost 会显得「还没做完」
 */
import { StyleSheet, View } from 'react-native';

import { defineDialog } from '@/components/overlay';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { space } from '@/design';
import { useT } from '@/i18n';

import type { OverlayProps } from '@/components/overlay';

export interface AlertOptions {
    title: string;
    message?: string;
    okText?: string;
}

function AlertDialogView({ payload, close }: OverlayProps<AlertOptions, void>) {
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
                <Button onPress={() => close()}>
                    {payload.okText ?? t('common.gotIt')}
                </Button>
            </View>
        </View>
    );
}

/** 提示框：`await showAlertDialog({...})`；任意关闭路径都 settle */
export const showAlertDialog = defineDialog(AlertDialogView);

const styles = StyleSheet.create({
    // 标题与正文是同一语块，间距小于语块到动作区的距离
    message: {
        marginTop: space.sm,
    },
    actions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: space.sm,
        marginTop: space.xl,
    },
});
