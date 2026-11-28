/**
 * 文本提交面板（组合内容，非壳）：底部 sheet 里一个 Input + 异步 onSubmit
 * 键盘避让由 Panel 壳统一处理（react-native-keyboard-controller）：竖屏底部 sheet 位移，横屏右侧不位移
 * onSubmit 成功 → close 并 resolve result；失败（{ok:false}）→ 留面板重试（失败提示由 onSubmit 自弹 toast）；提交中确认转圈、输入锁定
 * footer 等宽双按钮（取消 outline / 确认 filled）
 */
import { useEffect, useRef, useState } from 'react';
import {
    ScrollView,
    StyleSheet,
    View,
    type TextInputProps,
} from 'react-native';

import { definePanel } from '@/components/overlay';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { space } from '@/design';
import { useT } from '@/i18n';

import type { OverlayHandle, OverlayProps } from '@/components/overlay';

/** hints 区限高：约 4 行，超出内部滚动 */
const HINTS_MAX_HEIGHT = space['3xl'] * 2;

/** onSubmit 结果：成功带返回值、失败留面板重试（失败提示由 onSubmit 自弹） */
export type TextPromptSubmitOutcome<R> =
    | { ok: true; result: R }
    | { ok: false };

export interface TextPromptOptions<R> {
    title: string;
    message?: string;
    /** 输入格式提示（如插件 importXxx 的 hints）；多条限高滚动 */
    hints?: readonly string[];
    /** 输入法大小写策略（URL/ID 传 'none' 防首字母大写） */
    autoCapitalize?: TextInputProps['autoCapitalize'];
    /** 是否自动纠错（URL/ID 传 false） */
    autoCorrect?: boolean;
    /** 输入模式（URL 传 'url' 优化键盘） */
    inputMode?: TextInputProps['inputMode'];
    placeholder?: string;
    defaultValue?: string;
    /** 聚焦时全选已有文本：预填默认值时打开，可直接确认沿用或打字整体替换 */
    selectTextOnFocus?: boolean;
    confirmText?: string;
    cancelText?: string;
    multiline?: boolean;
    /** 输入最大字符数（按 UTF-16 码元计），到达上限即无法继续输入 */
    maxLength?: number;
    /** 提交：跑异步操作；成功 → close 并 resolve result，失败 → 返回 {ok:false} 留面板重试 */
    onSubmit: (value: string) => Promise<TextPromptSubmitOutcome<R>>;
}

function TextPromptPanelView({
    payload,
    close,
}: OverlayProps<TextPromptOptions<unknown>, unknown>) {
    const t = useT();
    const [value, setValue] = useState(payload.defaultValue ?? '');
    const [submitting, setSubmitting] = useState(false);
    const submittingRef = useRef(false);
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const handleConfirm = async () => {
        if (submittingRef.current || value.trim().length === 0) {
            return;
        }
        submittingRef.current = true;
        setSubmitting(true);
        let outcome: TextPromptSubmitOutcome<unknown>;
        try {
            outcome = await payload.onSubmit(value);
        } catch {
            // onSubmit 应自行处理失败反馈；意外异常仅留面板、不再提交
            outcome = { ok: false };
        }
        // 提交中被关掉（后台跑完可接受）→ 丢弃 UI 更新
        if (!mountedRef.current) {
            return;
        }
        submittingRef.current = false;
        if (outcome.ok) {
            close(outcome.result);
        } else {
            setSubmitting(false);
        }
    };

    return (
        <View style={styles.root}>
            <Text size="xl" weight="bold" lineHeight="tight">
                {payload.title}
            </Text>
            {payload.message ? (
                <Text color="textSecondary" style={styles.message}>
                    {payload.message}
                </Text>
            ) : null}
            <Input
                value={value}
                onChangeText={setValue}
                placeholder={payload.placeholder}
                autoFocus
                selectTextOnFocus={payload.selectTextOnFocus}
                clearable
                disabled={submitting}
                multiline={payload.multiline}
                maxRows={5}
                maxLength={payload.maxLength}
                autoCapitalize={payload.autoCapitalize}
                autoCorrect={payload.autoCorrect}
                inputMode={payload.inputMode}
                onSubmitEditing={payload.multiline ? undefined : handleConfirm}
                style={styles.input}
            />
            {payload.hints && payload.hints.length > 0 ? (
                <ScrollView
                    style={styles.hintsList}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {payload.hints.map((hint, index) => (
                        <Text
                            key={index}
                            size="sm"
                            color="textSecondary"
                            style={styles.hintItem}
                        >
                            {`· ${hint}`}
                        </Text>
                    ))}
                </ScrollView>
            ) : null}
            <View style={styles.actions}>
                <Button
                    variant="filled"
                    tone="neutral"
                    style={styles.actionBtn}
                    onPress={() => close()}
                >
                    {payload.cancelText ?? t('common.cancel')}
                </Button>
                <Button
                    variant="filled"
                    tone="primary"
                    style={styles.actionBtn}
                    loading={submitting}
                    disabled={value.trim().length === 0}
                    onPress={handleConfirm}
                >
                    {payload.confirmText ?? t('common.confirm')}
                </Button>
            </View>
        </View>
    );
}

const textPromptPanelOpener = definePanel(TextPromptPanelView);

/** 文本提交面板：`const r = await showTextPromptPanel<R>({ onSubmit })`；取消/返回键/backdrop → undefined */
export function showTextPromptPanel<R>(
    options: TextPromptOptions<R>,
): OverlayHandle<R> {
    return textPromptPanelOpener(
        options as TextPromptOptions<unknown>,
    ) as OverlayHandle<R>;
}

const styles = StyleSheet.create({
    root: {
        paddingHorizontal: space.lg,
    },
    message: {
        marginTop: space.xs,
    },
    hintsList: {
        marginTop: space.md,
        maxHeight: HINTS_MAX_HEIGHT,
    },
    hintItem: {
        marginTop: space.xs,
    },
    input: {
        marginTop: space.lg,
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
