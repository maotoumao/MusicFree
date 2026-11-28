/**
 * ReorderableList 拖拽重排探针：仅 __DEV__ 使用，压测大列表下的拖拽 / 自动滚动 / 回收正确性
 * 组件接入正式编辑页后此屏可删
 */
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
    ReorderableList,
    reorderItems,
    type ReorderableListRenderInfo,
} from '@/components/ui/reorderableList';

interface ProbeItem {
    id: string;
    /** 原始序号：重排后仍显示，用来肉眼核对次序与回收是否错乱 */
    origin: number;
    hue: number;
}

const ITEM_HEIGHT = 64;
const COUNT_OPTIONS = [100, 1000, 5000] as const;

function makeData(count: number): ProbeItem[] {
    return Array.from({ length: count }, (_, i) => ({
        id: `item-${i}`,
        origin: i,
        hue: Math.round((i * 360) / Math.max(1, count)),
    }));
}

function keyExtractor(item: ProbeItem) {
    return item.id;
}

export default function ReorderableListProbeScreen() {
    const [count, setCount] = useState<number>(1000);
    const [data, setData] = useState<ProbeItem[]>(() => makeData(1000));
    const [moves, setMoves] = useState(0);
    const [lastMove, setLastMove] = useState<string>('—');

    const reset = useCallback((next: number) => {
        setCount(next);
        setData(makeData(next));
        setMoves(0);
        setLastMove('—');
    }, []);

    const onReorder = useCallback(
        ({ from, to }: { from: number; to: number }) => {
            setData(current => reorderItems(current, from, to));
            setMoves(m => m + 1);
            setLastMove(`${from} → ${to}`);
        },
        [],
    );

    const renderItem = useCallback(
        ({ item, index, isDragging }: ReorderableListRenderInfo<ProbeItem>) => (
            <View style={[styles.row, isDragging && styles.rowActive]}>
                <Text style={styles.pos}>{index + 1}</Text>
                <View
                    style={[
                        styles.swatch,
                        { backgroundColor: `hsl(${item.hue}, 70%, 55%)` },
                    ]}
                />
                <Text style={styles.rowLabel}>
                    {item.id}（原序 {item.origin}）
                </Text>
            </View>
        ),
        [],
    );

    const summary = useMemo(
        () =>
            data.length > 0
                ? `${data.length} 项 · 首 ${data[0]?.id} · 尾 ${
                      data[data.length - 1]?.id
                  }`
                : '空',
        [data],
    );

    return (
        <SafeAreaView style={styles.screen} edges={['top']}>
            <View style={styles.header}>
                <Text style={styles.title}>ReorderableList 拖拽探针</Text>
                <Text style={styles.stat}>
                    重排 {moves} 次 · 上次 {lastMove}
                </Text>
                <Text style={styles.stat}>{summary}</Text>
                <View style={styles.controls}>
                    {COUNT_OPTIONS.map(option => (
                        <TouchableOpacity
                            key={option}
                            style={[
                                styles.btn,
                                option === count && styles.btnActive,
                            ]}
                            onPress={() => reset(option)}
                        >
                            <Text style={styles.btnText}>{option} 项</Text>
                        </TouchableOpacity>
                    ))}
                </View>
                <Text style={styles.hint}>
                    拖右侧把手重排；拖到顶/底自动滚动
                </Text>
            </View>
            <ReorderableList
                data={data}
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                itemHeight={ITEM_HEIGHT}
                onReorder={onReorder}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: '#fff',
    },
    header: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#ddd',
        gap: 4,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111',
    },
    stat: {
        fontSize: 13,
        color: '#555',
    },
    controls: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 6,
    },
    btn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: '#eee',
    },
    btnActive: {
        backgroundColor: '#c9d8ff',
    },
    btnText: {
        fontSize: 13,
        color: '#111',
    },
    hint: {
        fontSize: 12,
        color: '#888',
        marginTop: 4,
    },
    row: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        gap: 12,
        backgroundColor: '#fff',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#eee',
    },
    rowActive: {
        backgroundColor: '#eef3ff',
    },
    pos: {
        width: 44,
        fontSize: 13,
        color: '#888',
    },
    swatch: {
        width: 28,
        height: 28,
        borderRadius: 6,
    },
    rowLabel: {
        fontSize: 15,
        color: '#111',
    },
});
