/**
 * 订阅源编辑面板（组合内容，非壳）：名称 + 地址两个输入，新增 / 编辑共用
 * 校验（地址格式 / 重复）与落库交调用方的 onSubmit：成功 → 关闭面板，失败 → 留面板重试（失败提示由 onSubmit 自弹）
 * 键盘避让由 Panel 壳统一处理；提交中确认转圈、输入锁定
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { definePanel } from '@/components/overlay';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { space } from '@/design';
import { useT } from '@/i18n';

import type { OverlayProps } from '@/components/overlay';
import type { SubscribeSource } from '@/core/plugin';

/** onSubmit 结果：成功 → 关闭面板，失败 → 留面板重试 */
export type SubscriptionSubmitOutcome = { ok: true } | { ok: false };

export interface PluginSubscriptionOptions {
    /** 给了 = 编辑（预填现有值），不给 = 新增 */
    source?: SubscribeSource;
    /** 提交：校验与落库交调用方；成功 → close，失败 → 返回 {ok:false} 留面板 */
    onSubmit: (draft: SubscribeSource) => Promise<SubscriptionSubmitOutcome>;
}

function PluginSubscriptionPanelView({
    payload,
    close,
}: OverlayProps<PluginSubscriptionOptions, void>) {
    const t = useT();
    const isEdit = payload.source !== undefined;
    const [name, setName] = useState(payload.source?.name ?? '');
    const [url, setUrl] = useState(payload.source?.url ?? '');
    const [submitting, setSubmitting] = useState(false);
    const submittingRef = useRef(false);
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    // 名称与地址都非空才可提交；格式 / 重复校验在 onSubmit 里，失败留面板
    const canSubmit = name.trim().length > 0 && url.trim().length > 0;

    const handleConfirm = async () => {
        if (submittingRef.current || !canSubmit) {
            return;
        }
        submittingRef.current = true;
        setSubmitting(true);
        let outcome: SubscriptionSubmitOutcome;
        try {
            outcome = await payload.onSubmit({
                name: name.trim(),
                url: url.trim(),
            });
        } catch {
            // onSubmit 应自行处理失败反馈；意外异常仅留面板
            outcome = { ok: false };
        }
        // 提交中被关掉 → 丢弃 UI 更新
        if (!mountedRef.current) {
            return;
        }
        submittingRef.current = false;
        if (outcome.ok) {
            close();
        } else {
            setSubmitting(false);
        }
    };

    return (
        <View style={styles.root}>
            <Text size="xl" weight="bold" lineHeight="tight">
                {isEdit
                    ? t('pluginSubscriptionPanel.edit.title')
                    : t('pluginSubscriptionPanel.add.title')}
            </Text>
            <View style={styles.field}>
                <Text size="sm" color="textSecondary" style={styles.label}>
                    {t('pluginSubscriptionPanel.name')}
                </Text>
                <Input
                    value={name}
                    onChangeText={setName}
                    accessibilityLabel={t('pluginSubscriptionPanel.name')}
                    autoFocus={!isEdit}
                    disabled={submitting}
                />
            </View>
            <View style={styles.field}>
                <Text size="sm" color="textSecondary" style={styles.label}>
                    {t('pluginSubscriptionPanel.url')}
                </Text>
                <Input
                    value={url}
                    onChangeText={setUrl}
                    accessibilityLabel={t('pluginSubscriptionPanel.url')}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    disabled={submitting}
                    onSubmitEditing={handleConfirm}
                />
            </View>
            <View style={styles.actions}>
                <Button
                    variant="filled"
                    tone="neutral"
                    style={styles.actionBtn}
                    onPress={() => close()}
                >
                    {t('common.cancel')}
                </Button>
                <Button
                    variant="filled"
                    tone="primary"
                    style={styles.actionBtn}
                    loading={submitting}
                    disabled={!canSubmit}
                    onPress={handleConfirm}
                >
                    {t('common.confirm')}
                </Button>
            </View>
        </View>
    );
}

/** 订阅源编辑面板：`showPluginSubscriptionPanel({ source?, onSubmit })`；取消/返回键/backdrop → 关闭不落库 */
export const showPluginSubscriptionPanel = definePanel(
    PluginSubscriptionPanelView,
);

const styles = StyleSheet.create({
    root: {
        paddingHorizontal: space.lg,
    },
    field: {
        marginTop: space.lg,
    },
    label: {
        marginBottom: space.xs,
    },
    actions: {
        flexDirection: 'row',
        gap: space.md,
        marginTop: space.xl,
    },
    actionBtn: {
        flex: 1,
    },
});
