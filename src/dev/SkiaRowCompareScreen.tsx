/**
 * Skia 行对比屏（子任务 1）：每组上 = 真 MusicRow(RN)、下 = SkiaListItem(Skia 自绘)，肉眼比像素对齐
 * 看：行高、序号/标题/副标题的位置与字号、平台 Tag 位置/样式、明暗色、中英/emoji/长标题省略号；切主题分别验
 * 验证后此屏可删
 */
import { Canvas } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import {
    ScrollView,
    StyleSheet,
    useWindowDimensions,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Checkbox } from '@/components/ui/Checkbox';
import {
    buildRowParagraph,
    measureTagWidth,
    rowContentBounds,
    SKIA_ROW_HEIGHT,
    SkiaListItem,
    TAG_GAP,
    TAG_MAX_FRACTION,
    TAG_PAD_H,
    TAG_TEXT_SIZE,
} from '@/components/ui/reorderableMediaList/SkiaListItem';
import { Text } from '@/components/ui/Text';
import { fontSize, useColors } from '@/design';
import { MusicRow } from '@/widgets/MusicRow';

import type { MusicItem } from '@/types';

const MOCK: { item: MusicItem; position: number }[] = [
    {
        position: 1,
        item: {
            platform: 'demo',
            id: '1',
            title: '晴天',
            artist: '周杰伦',
            album: '叶惠美',
        } as unknown as MusicItem,
    },
    {
        position: 2,
        item: {
            platform: '测试源',
            id: '2',
            title: 'Bohemian Rhapsody (Remastered 2011) Extended Long Title',
            artist: 'Queen',
            album: 'A Night at the Opera',
        } as unknown as MusicItem,
    },
    {
        position: 3,
        item: {
            platform: 'demo',
            id: '3',
            title: '🎵 混排 Emoji テスト 한국어 标题',
            artist: '未知歌手',
            album: undefined,
        } as unknown as MusicItem,
    },
    {
        position: 4,
        item: {
            platform: 'demo',
            id: '4',
            title: '短',
            artist: 'A',
            album: 'B',
        } as unknown as MusicItem,
    },
    {
        position: 5,
        item: {
            platform: 'longdemo',
            id: '5',
            title: '一二三四五六七八九十一二三四五六七八九十很长的中文标题继续',
            artist: '某某歌手',
            album: '某某专辑',
        } as unknown as MusicItem,
    },
    {
        position: 999,
        item: {
            platform: 'demo',
            id: '6',
            title: '三位行号 999（边界）',
            artist: '某歌手',
            album: '某专辑',
        } as unknown as MusicItem,
    },
    {
        position: 1234,
        item: {
            platform: 'demo',
            id: '7',
            title: '四位行号 1234',
            artist: '某歌手',
            album: '某专辑',
        } as unknown as MusicItem,
    },
    {
        position: 12345,
        item: {
            platform: 'demo',
            id: '8',
            title: '五位行号 12345',
            artist: '某歌手',
            album: '某专辑',
        } as unknown as MusicItem,
    },
];

function subtitleOf(item: MusicItem): string {
    const artist =
        (typeof item.artist === 'string' && item.artist.trim()) || '未知歌手';
    const album = typeof item.album === 'string' ? item.album : undefined;
    return [artist, album].filter(Boolean).join(' - ');
}

export default function SkiaRowCompareScreen() {
    const { width } = useWindowDimensions();
    const colors = useColors();

    const rows = useMemo(
        () =>
            MOCK.map(({ item, position }) => {
                // 平台 Tag：建 label → 量 pill 宽 → 右对齐、算标题让宽（同列表 4-ii 的做法）
                const sourceLabel = buildRowParagraph(
                    item.platform,
                    colors.textSecondary,
                    TAG_TEXT_SIZE,
                );
                const { contentX, contentRight } = rowContentBounds(
                    width,
                    true,
                    false,
                );
                const tagWidth = Math.min(
                    measureTagWidth(sourceLabel),
                    (contentRight - contentX) * TAG_MAX_FRACTION,
                );
                const tagX = contentRight - tagWidth;
                return {
                    item,
                    position,
                    title: buildRowParagraph(
                        item.title,
                        colors.text,
                        fontSize.md,
                    ),
                    subtitle: buildRowParagraph(
                        subtitleOf(item),
                        colors.textSecondary,
                        fontSize.sm,
                    ),
                    positionParagraph: buildRowParagraph(
                        String(position),
                        colors.textSecondary,
                        fontSize.md,
                        true,
                    ),
                    sourceLabel,
                    tagWidth,
                    tagLabelWidth: Math.max(0, tagWidth - 2 * TAG_PAD_H),
                    tagTransform: [{ translateX: tagX }],
                    titleWidth: Math.max(0, tagX - TAG_GAP - contentX),
                };
            }),
        [colors, width],
    );

    const cbDemo = useMemo(
        () => ({
            title: buildRowParagraph(
                '多选示例歌曲标题',
                colors.text,
                fontSize.md,
            ),
            subtitle: buildRowParagraph(
                '歌手 - 专辑',
                colors.textSecondary,
                fontSize.sm,
            ),
        }),
        [colors],
    );

    return (
        <SafeAreaView
            style={[styles.screen, { backgroundColor: colors.background }]}
            edges={['top']}
        >
            <ScrollView>
                <View style={styles.note}>
                    <Text size="sm" color="textSecondary">
                        每组：上 = 真 MusicRow(RN)，下 =
                        SkiaListItem(自绘)。切明暗主题分别看
                    </Text>
                </View>
                {rows.map(row => (
                    <View
                        key={row.item.id}
                        style={[
                            styles.pair,
                            { borderBottomColor: colors.border },
                        ]}
                    >
                        <MusicRow item={row.item} position={row.position} />
                        <Canvas style={{ width, height: SKIA_ROW_HEIGHT }}>
                            <SkiaListItem
                                width={width}
                                showPosition
                                showHandle={false}
                                handleColor={colors.textSecondary}
                                backgroundColor="transparent"
                                titleParagraph={row.title}
                                titleWidth={row.titleWidth}
                                subtitleParagraph={row.subtitle}
                                positionParagraph={row.positionParagraph}
                                sourceLabelParagraph={row.sourceLabel}
                                tagWidth={row.tagWidth}
                                tagLabelWidth={row.tagLabelWidth}
                                tagTransform={row.tagTransform}
                                tagBackground={colors.surfaceVariant}
                            />
                        </Canvas>
                    </View>
                ))}
                <View style={styles.note}>
                    <Text size="sm" color="textSecondary">
                        多选 checkbox：上排 = RN Checkbox 组件，下方两行 = Skia
                        自绘（未选 / 选中）
                    </Text>
                </View>
                <View style={styles.cbRow}>
                    <Checkbox checked={false} />
                    <Checkbox checked />
                </View>
                <Canvas style={{ width, height: SKIA_ROW_HEIGHT }}>
                    <SkiaListItem
                        width={width}
                        showPosition={false}
                        showCheckbox
                        showHandle={false}
                        handleColor={colors.textSecondary}
                        backgroundColor="transparent"
                        titleParagraph={cbDemo.title}
                        subtitleParagraph={cbDemo.subtitle}
                        positionParagraph={null}
                        checkboxFill="transparent"
                        checkboxBorder={colors.border}
                        checkboxCheck="transparent"
                    />
                </Canvas>
                <Canvas style={{ width, height: SKIA_ROW_HEIGHT }}>
                    <SkiaListItem
                        width={width}
                        showPosition={false}
                        showCheckbox
                        showHandle={false}
                        handleColor={colors.textSecondary}
                        backgroundColor={colors.primarySoft}
                        titleParagraph={cbDemo.title}
                        subtitleParagraph={cbDemo.subtitle}
                        positionParagraph={null}
                        checkboxFill={colors.primary}
                        checkboxBorder={colors.primary}
                        checkboxCheck={colors.onPrimary}
                    />
                </Canvas>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1 },
    note: { padding: 12 },
    pair: { borderBottomWidth: 4 },
    cbRow: { flexDirection: 'row', gap: 16, padding: 12 },
});
