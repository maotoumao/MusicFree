import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ScrollView,
    StyleSheet,
    View,
    type LayoutChangeEvent,
    type NativeScrollEvent,
    type NativeSyntheticEvent,
} from 'react-native';

import { definePanel } from '@/components/overlay';
import { Button } from '@/components/ui/Button';
import { ContentUnavailable } from '@/components/ui/ContentUnavailable';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { space } from '@/design';
import { useT } from '@/i18n';
import { clamp } from '@/utils/number';

import type { OverlayProps } from '@/components/overlay';
import type { UserVariable } from '@/types';

export interface PluginVariablesOptions {
    /** 插件公开身份；Plugin 无独立 name 字段 */
    platform: string;
    /** 插件 wire 契约声明的变量 schema */
    variables: readonly UserVariable[];
    /** 当前已保存值；Panel 内只编辑副本 */
    currentValues: Readonly<Record<string, string>>;
}

interface FieldLayout {
    y: number;
    height: number;
}

function createDraftValues(
    variables: readonly UserVariable[],
    currentValues: Readonly<Record<string, string>>,
): Record<string, string> {
    const draft: Record<string, string> = {};
    for (const variable of variables) {
        draft[variable.key] = currentValues[variable.key] ?? '';
    }
    return draft;
}

function PluginVariablesPanelView({
    payload,
    close,
}: OverlayProps<PluginVariablesOptions, Record<string, string>>) {
    const t = useT();
    const [values, setValues] = useState(() =>
        createDraftValues(payload.variables, payload.currentValues),
    );
    const empty = payload.variables.length === 0;
    const scrollRef = useRef<ScrollView>(null);
    const fieldLayoutsRef = useRef(new Map<string, FieldLayout>());
    const focusedFieldRef = useRef<string | null>(null);
    const viewportHeightRef = useRef(0);
    const contentHeightRef = useRef(0);
    const scrollOffsetRef = useRef(0);
    const ensureFrameRef = useRef<number | null>(null);

    const ensureFocusedFieldVisible = useCallback(() => {
        const focusedField = focusedFieldRef.current;
        const viewportHeight = viewportHeightRef.current;
        if (!focusedField || viewportHeight <= 0) {
            return;
        }
        const fieldLayout = fieldLayoutsRef.current.get(focusedField);
        if (!fieldLayout) {
            return;
        }
        const currentOffset = scrollOffsetRef.current;
        const visibleTop = currentOffset;
        const visibleBottom = currentOffset + viewportHeight;
        const fieldTop = fieldLayout.y;
        const fieldBottom = fieldLayout.y + fieldLayout.height;
        const margin = space.sm;
        let targetOffset: number | undefined;
        if (fieldBottom + margin > visibleBottom) {
            targetOffset = fieldBottom + margin - viewportHeight;
        } else if (fieldTop - margin < visibleTop) {
            targetOffset = fieldTop - margin;
        }
        if (targetOffset == null) {
            return;
        }
        const maxOffset = Math.max(
            0,
            contentHeightRef.current - viewportHeight,
        );
        const nextOffset = clamp(targetOffset, 0, maxOffset);
        if (Math.abs(nextOffset - currentOffset) < 1) {
            return;
        }
        scrollOffsetRef.current = nextOffset;
        scrollRef.current?.scrollTo({ y: nextOffset, animated: false });
    }, []);

    const scheduleEnsureFocusedFieldVisible = useCallback(() => {
        if (ensureFrameRef.current != null) {
            cancelAnimationFrame(ensureFrameRef.current);
        }
        ensureFrameRef.current = requestAnimationFrame(() => {
            ensureFrameRef.current = null;
            ensureFocusedFieldVisible();
        });
    }, [ensureFocusedFieldVisible]);

    useEffect(
        () => () => {
            if (ensureFrameRef.current != null) {
                cancelAnimationFrame(ensureFrameRef.current);
            }
        },
        [],
    );

    const updateValue = (key: string, value: string) => {
        setValues(current => ({ ...current, [key]: value }));
    };

    return (
        <View style={styles.root}>
            <Text
                size="xl"
                weight="bold"
                lineHeight="tight"
                style={styles.title}
            >
                {t('pluginVariablesPanel.title', {
                    platform: payload.platform,
                })}
            </Text>
            {empty ? (
                <ContentUnavailable
                    icon="settings"
                    title={t('pluginVariablesPanel.noVariables')}
                    style={styles.empty}
                />
            ) : (
                <ScrollView
                    ref={scrollRef}
                    style={styles.body}
                    contentContainerStyle={styles.fields}
                    keyboardDismissMode="on-drag"
                    keyboardShouldPersistTaps="handled"
                    scrollEventThrottle={16}
                    onLayout={(event: LayoutChangeEvent) => {
                        viewportHeightRef.current =
                            event.nativeEvent.layout.height;
                        scheduleEnsureFocusedFieldVisible();
                    }}
                    onContentSizeChange={(_, height) => {
                        contentHeightRef.current = height;
                        scheduleEnsureFocusedFieldVisible();
                    }}
                    onScroll={(
                        event: NativeSyntheticEvent<NativeScrollEvent>,
                    ) => {
                        scrollOffsetRef.current =
                            event.nativeEvent.contentOffset.y;
                    }}
                >
                    {payload.variables.map((variable, index) => {
                        const label = variable.name ?? variable.key;
                        const fieldId = `${variable.key}-${index}`;
                        return (
                            <View
                                key={fieldId}
                                onLayout={(event: LayoutChangeEvent) => {
                                    const { y, height } =
                                        event.nativeEvent.layout;
                                    fieldLayoutsRef.current.set(fieldId, {
                                        y,
                                        height,
                                    });
                                    if (focusedFieldRef.current === fieldId) {
                                        scheduleEnsureFocusedFieldVisible();
                                    }
                                }}
                            >
                                <Text size="md" weight="medium">
                                    {label}
                                </Text>
                                {variable.hint ? (
                                    <Text
                                        size="sm"
                                        color="textSecondary"
                                        style={styles.hint}
                                    >
                                        {variable.hint}
                                    </Text>
                                ) : null}
                                <Input
                                    value={values[variable.key] ?? ''}
                                    onChangeText={value =>
                                        updateValue(variable.key, value)
                                    }
                                    onFocus={() => {
                                        focusedFieldRef.current = fieldId;
                                        scheduleEnsureFocusedFieldVisible();
                                    }}
                                    onBlur={() => {
                                        if (
                                            focusedFieldRef.current === fieldId
                                        ) {
                                            focusedFieldRef.current = null;
                                        }
                                    }}
                                    accessibilityLabel={label}
                                    style={styles.input}
                                />
                            </View>
                        );
                    })}
                </ScrollView>
            )}
            <View style={styles.spacer} />
            <View style={styles.actions}>
                {empty ? (
                    <Button
                        variant="filled"
                        tone="neutral"
                        size="lg"
                        style={styles.action}
                        onPress={() => close()}
                    >
                        {t('common.close')}
                    </Button>
                ) : (
                    <>
                        <Button
                            variant="filled"
                            tone="neutral"
                            style={styles.action}
                            onPress={() => close()}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            variant="filled"
                            style={styles.action}
                            onPress={() => close({ ...values })}
                        >
                            {t('common.save')}
                        </Button>
                    </>
                )}
            </View>
        </View>
    );
}

/** 插件变量编辑 Panel：保存返回当前 schema 的完整值表；取消返回 undefined */
export const showPluginVariablesPanel = definePanel(PluginVariablesPanelView);

const styles = StyleSheet.create({
    root: {
        flexGrow: 1,
        flexShrink: 1,
    },
    title: {
        paddingHorizontal: space.lg,
    },
    body: {
        flexShrink: 1,
        marginTop: space.lg,
    },
    fields: {
        gap: space.lg,
        paddingHorizontal: space.lg,
    },
    hint: {
        marginTop: space.xs,
    },
    input: {
        marginTop: space.xs,
    },
    empty: {
        flex: 0,
        paddingVertical: space['2xl'],
    },
    spacer: {
        flex: 1,
        minHeight: space.xl,
    },
    actions: {
        flexDirection: 'row',
        gap: space.md,
        paddingHorizontal: space.lg,
    },
    action: {
        flex: 1,
    },
});
