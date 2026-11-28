import { useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import {
    fontSize,
    layout,
    lineHeightMultiplier,
    radius,
    space,
    useColors,
} from '@/design';
import { useT } from '@/i18n';

import type { RefObject } from 'react';

/** 切段时要显式交接焦点：隐藏那段的原生实例还在，不会自动让位 */
export interface LyricCanvasHandle {
    focus: () => void;
}

interface LyricCanvasProps {
    ref?: RefObject<LyricCanvasHandle | null>;
    /** 非受控初值；外部改写文本时由调用方换 key 重挂 */
    defaultValue: string;
    onChangeText: (value: string) => void;
    maxLength: number;
    accessibilityLabel: string;
    /** 译文段只给普通 placeholder，不给空态引导层（它没有第二条输入路径） */
    placeholder?: string;
    /** 空态引导层的动作；给了才渲染引导层 */
    onImport?: () => void;
}

/**
 * 歌词编辑画布：单个 multiline TextInput（背后是原生 EditText / UITextView，几百行不必虚拟化）
 * 空且未聚焦时叠一层引导：说明「粘贴什么」并给出另一条输入路径，聚焦或有值即消失
 */
export function LyricCanvas({
    ref,
    defaultValue,
    onChangeText,
    maxLength,
    accessibilityLabel,
    placeholder,
    onImport,
}: LyricCanvasProps) {
    const t = useT();
    const colors = useColors();
    const [empty, setEmpty] = useState(defaultValue === '');
    const [focused, setFocused] = useState(false);
    const inputRef = useRef<TextInput>(null);
    useImperativeHandle(ref, () => ({
        focus: () => inputRef.current?.focus(),
    }));

    return (
        <View style={styles.root}>
            <TextInput
                ref={inputRef}
                defaultValue={defaultValue}
                onChangeText={value => {
                    setEmpty(value === '');
                    onChangeText(value);
                }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                multiline
                textAlignVertical="top"
                allowFontScaling={false}
                maxLength={maxLength}
                placeholder={placeholder}
                placeholderTextColor={colors.textDisabled}
                accessibilityLabel={accessibilityLabel}
                selectionColor={colors.primary}
                style={[
                    styles.input,
                    {
                        backgroundColor: colors.surfaceVariant,
                        color: colors.text,
                    },
                ]}
            />
            {onImport && empty && !focused ? (
                // 空输入框不解释「粘贴什么」；一旦开始输入这层就不该继续占高度
                <View style={styles.guide} pointerEvents="box-none">
                    <Text size="sm" color="textSecondary">
                        {t('editLyric.emptyHint')}
                    </Text>
                    <Text
                        size="sm"
                        color="textSecondary"
                        style={styles.guideDetail}
                    >
                        {t('editLyric.emptyHintDetail')}
                    </Text>
                    <Button
                        variant="outline"
                        tone="neutral"
                        icon="import"
                        onPress={onImport}
                        style={styles.guideAction}
                    >
                        {t('editLyric.importFile')}
                    </Button>
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        marginHorizontal: layout.screenGutter,
        marginBottom: space.md,
    },
    input: {
        flex: 1,
        padding: space.md,
        borderRadius: radius.md,
        fontSize: fontSize.md,
        lineHeight: fontSize.md * lineHeightMultiplier.relaxed,
        // 只让时间戳的数字列等宽，不把中文歌词整体变成代码观感
        fontVariant: ['tabular-nums'],
    },
    guide: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space.xl,
    },
    guideDetail: {
        marginTop: space.xs,
        textAlign: 'center',
    },
    guideAction: {
        marginTop: space.lg,
    },
});
