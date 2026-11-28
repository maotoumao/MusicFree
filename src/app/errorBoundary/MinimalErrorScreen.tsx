/**
 * 最后一级兜底：**零共享依赖**
 *
 * 这一层专门接住「连主题 / i18n / 设计系统自己都出问题」的情况。若它复用
 * `useColors`、`t()`、`Icon`、`Button`，而崩溃源头恰好就在那条链上，兜底页
 * 渲染时会二次抛出——此时已没有更高的边界，React 卸载整棵树，退化成真白屏。
 *
 * 故这里只用 RN 原生 `View`/`Text`/`Pressable`、写死颜色与中英双语文案。
 * 好看的那版留给内层（那时能确认 Providers 与设计系统都是活的）。
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface MinimalErrorScreenProps {
    error: Error;
    onCopy(): void;
}

/** 写死中性深色：主题不可用，且深底浅字在任何设备上都不至于看不见 */
const COLORS = {
    background: '#1a1a1a',
    text: '#f5f5f5',
    muted: '#a3a3a3',
    surface: '#2b2b2b',
    border: '#3d3d3d',
} as const;

/** 最后一道不该有任何前提：即使拿到的不是 Error 也要能画出来 */
function describe(error: Error): string {
    try {
        return `${error.name}: ${error.message}`;
    } catch {
        return '未知错误 / Unknown error';
    }
}

export function MinimalErrorScreen({ error, onCopy }: MinimalErrorScreenProps) {
    return (
        <View style={styles.root}>
            <Text style={styles.title}>应用遇到了问题</Text>
            <Text style={styles.subtitle}>Something went wrong</Text>
            <View style={styles.detail}>
                <Text style={styles.detailText} numberOfLines={6}>
                    {describe(error)}
                </Text>
            </View>
            <Pressable
                onPress={onCopy}
                accessibilityRole="button"
                style={styles.button}
            >
                <Text style={styles.buttonText}>复制错误详情 / Copy</Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: COLORS.background,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        gap: 12,
    },
    title: { color: COLORS.text, fontSize: 18, fontWeight: '700' },
    subtitle: { color: COLORS.muted, fontSize: 13 },
    detail: {
        alignSelf: 'stretch',
        backgroundColor: COLORS.surface,
        borderColor: COLORS.border,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 8,
        padding: 12,
    },
    detailText: { color: COLORS.muted, fontSize: 13 },
    button: {
        alignSelf: 'stretch',
        alignItems: 'center',
        backgroundColor: COLORS.surface,
        borderColor: COLORS.border,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 8,
        paddingVertical: 12,
    },
    buttonText: { color: COLORS.text, fontSize: 15, fontWeight: '600' },
});
