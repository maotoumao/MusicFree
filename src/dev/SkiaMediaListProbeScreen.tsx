/**
 * Skia 媒体列表探针：压测 ReorderableMediaList（虚拟滚动 + 拖拽重排）
 * 看：滚动顺不顺 · 行内容/序号 · 中英/emoji · 把手拖拽落定重排 · 久滚不崩不涨内存
 * 验证后此屏可删
 */
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ReorderableMediaList } from '@/components/ui/reorderableMediaList/ReorderableMediaList';
import {
    type MediaRowContent,
    type ReorderEvent,
} from '@/components/ui/reorderableMediaList/types';
import { useColors } from '@/design';

interface Song {
    id: string;
    title: string;
    subtitle: string;
    sourceLabel: string;
}

const TITLE_BANK = [
    '晴天',
    'Bohemian Rhapsody Extended Very Long Title Version',
    '🎵 混排 Emoji テスト 한국어 标题',
    '短',
    '一二三四五六七八九十的很长中文标题继续加长再加长',
    '夜曲',
];
const ARTIST_BANK = ['周杰伦', 'Queen', '未知歌手', 'A', '某某歌手'];
// 平台 Tag 占位（通用名、非真实源）：含空串（无 Tag）+ 超长（验截断），交替测回收与让位
const SOURCE_BANK = [
    'demo',
    '测试源',
    '',
    'longdemo',
    '超长占位来源名称测试abcdef',
];
const COUNTS = [100, 1000, 10000] as const;

function makeData(count: number): Song[] {
    return Array.from({ length: count }, (_, i) => ({
        id: `song-${i}`,
        title: `${i + 1}. ${TITLE_BANK[i % TITLE_BANK.length]}`,
        subtitle: `${ARTIST_BANK[i % ARTIST_BANK.length]} - 专辑${i % 300}`,
        sourceLabel: SOURCE_BANK[i % SOURCE_BANK.length] ?? 'demo',
    }));
}

function keyExtractor(song: Song): string {
    return song.id;
}
function getItemContent(song: Song): MediaRowContent {
    return {
        title: song.title,
        subtitle: song.subtitle,
        sourceLabel: song.sourceLabel,
    };
}

export default function SkiaMediaListProbeScreen() {
    const colors = useColors();
    const [count, setCount] = useState<number>(10000);
    const [data, setData] = useState<Song[]>(() => makeData(10000));
    const [selectable, setSelectable] = useState(false);
    const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(
        () => new Set(),
    );
    // 切档时重置数据 + 清空选中（数据变、旧选中失效）
    useEffect(() => {
        setData(makeData(count));
        setSelectedKeys(new Set());
    }, [count]);
    const onReorder = useCallback(({ from, to }: ReorderEvent) => {
        setData(prev => {
            const next = prev.slice();
            const [moved] = next.splice(from, 1);
            if (moved !== undefined) {
                next.splice(to, 0, moved);
            }
            return next;
        });
    }, []);
    const onToggleSelect = useCallback((key: string) => {
        setSelectedKeys(prev => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    }, []);
    // 全选/反选/清空：性能压测点（万首一次成集，验列表 UI 镜像 O(1) 不卡）
    const selectAll = useCallback(() => {
        setSelectedKeys(new Set(data.map(keyExtractor)));
    }, [data]);
    const invertSelect = useCallback(() => {
        setSelectedKeys(prev => {
            const next = new Set<string>();
            for (const song of data) {
                if (!prev.has(song.id)) {
                    next.add(song.id);
                }
            }
            return next;
        });
    }, [data]);
    const clearSelect = useCallback(() => {
        setSelectedKeys(new Set());
    }, []);

    return (
        <SafeAreaView
            style={[styles.screen, { backgroundColor: colors.background }]}
            edges={['top']}
        >
            <View style={styles.header}>
                <Text style={[styles.title, { color: colors.text }]}>
                    Skia 媒体列表 · {count} 行
                </Text>
                <View style={styles.controls}>
                    {COUNTS.map(option => (
                        <TouchableOpacity
                            key={option}
                            style={[
                                styles.btn,
                                option === count && styles.btnActive,
                            ]}
                            onPress={() => setCount(option)}
                        >
                            <Text style={styles.btnText}>{option}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
                <View style={styles.controls}>
                    <TouchableOpacity
                        style={[styles.btn, selectable && styles.btnActive]}
                        onPress={() => setSelectable(v => !v)}
                    >
                        <Text style={styles.btnText}>
                            多选 {selectable ? '开' : '关'}
                        </Text>
                    </TouchableOpacity>
                    {selectable ? (
                        <>
                            <TouchableOpacity
                                style={styles.btn}
                                onPress={selectAll}
                            >
                                <Text style={styles.btnText}>全选</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.btn}
                                onPress={invertSelect}
                            >
                                <Text style={styles.btnText}>反选</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.btn}
                                onPress={clearSelect}
                            >
                                <Text style={styles.btnText}>清空</Text>
                            </TouchableOpacity>
                            <Text
                                style={[styles.title, { color: colors.text }]}
                            >
                                已选 {selectedKeys.size}
                            </Text>
                        </>
                    ) : null}
                </View>
            </View>
            <ReorderableMediaList
                data={data}
                keyExtractor={keyExtractor}
                getItemContent={getItemContent}
                showPosition={!selectable}
                selectable={selectable}
                selectedKeys={selectedKeys}
                onToggleSelect={onToggleSelect}
                onReorder={onReorder}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1 },
    header: { padding: 12, gap: 8 },
    title: { fontSize: 15, fontWeight: '700' },
    controls: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    btn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: '#333',
    },
    btnActive: { backgroundColor: '#4a7' },
    btnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
