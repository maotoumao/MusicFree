import { useCallback, useEffect, useRef } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { space } from '@/design';
import { useGutterExtra } from '@/hooks/useContentColumn';

import { Chip } from './Chip';

export interface ChipRowItem {
    key: string;
    label: string;
}

interface ChipRowProps {
    items: readonly ChipRowItem[];
    /** 当前选中项 key */
    activeKey: string;
    onSelect: (key: string) => void;
}

/**
 * 横向可滚动单选 chip 行：单选（当前项持续高亮），自动把选中项居中滚入视野
 * 项多超屏可横滑、长名称也不会被裁得够不着（区别于不可滚的 Tabs）
 */
export function ChipRow({ items, activeKey, onSelect }: ChipRowProps) {
    const scrollRef = useRef<ScrollView>(null);
    const layouts = useRef(new Map<string, { x: number; width: number }>());
    const viewportWidth = useRef(0);
    // 平板：首尾 chip 与页面内容线（32）对齐；手机 undefined、沿用 16
    const gutterExtra = useGutterExtra();

    // 把选中项居中滚入视野；超界由 ScrollView 自钳
    const scrollActiveIntoView = useCallback(() => {
        const l = layouts.current.get(activeKey);
        const vw = viewportWidth.current;
        if (l && vw > 0) {
            scrollRef.current?.scrollTo({
                x: Math.max(0, l.x + l.width / 2 - vw / 2),
                animated: true,
            });
        }
    }, [activeKey]);

    // 选中变化时居中；viewport / 布局异步到达（下方 onLayout·onContentSizeChange）时重试
    useEffect(() => {
        scrollActiveIntoView();
    }, [scrollActiveIntoView]);

    return (
        <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={styles.bar}
            contentContainerStyle={
                gutterExtra ? [styles.content, gutterExtra] : styles.content
            }
            accessibilityRole="tablist"
            onLayout={e => {
                viewportWidth.current = e.nativeEvent.layout.width;
                scrollActiveIntoView();
            }}
            onContentSizeChange={scrollActiveIntoView}
        >
            {items.map(item => (
                <Chip
                    key={item.key}
                    label={item.label}
                    accessibilityRole="tab"
                    selected={item.key === activeKey}
                    onPress={() => onSelect(item.key)}
                    onLayout={e => {
                        layouts.current.set(item.key, {
                            x: e.nativeEvent.layout.x,
                            width: e.nativeEvent.layout.width,
                        });
                        if (item.key === activeKey) {
                            scrollActiveIntoView();
                        }
                    }}
                />
            ))}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    // 横向 ScrollView 在竖直 flex 列里默认纵向撑满，flexGrow:0 让它只占内容高
    bar: {
        flexGrow: 0,
    },
    content: {
        alignItems: 'center',
        gap: space.sm,
        paddingHorizontal: space.lg,
        paddingVertical: space.sm,
    },
});
