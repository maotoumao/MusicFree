import { memo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Tag } from '@/components/ui/Tag';
import { Text } from '@/components/ui/Text';
import { fontSize, lineHeightMultiplier, space } from '@/design';

import { PlayerCoverArt } from './PlayerCoverArt';

// meta 固定高度：预留 2 行标题 + 间距 + 1 行艺术家
// 标题行数（1/2 行）或艺术家有无都不改高度，封面尺寸恒定、切歌不跳动
const META_HEIGHT =
    fontSize['2xl'] * lineHeightMultiplier.tight * 2 +
    space.sm +
    fontSize.md * lineHeightMultiplier.tight;

interface CoverStageProps {
    artwork?: string;
    title: string;
    artist?: string;
    platform?: string;
    /** 封面边长封顶（dp）：平板上可用空间远大于手机，不让封面变成海报；手机不传 */
    maxSize?: number;
}

/** 封面模式主区：大封面 + 左对齐标题 + 艺术家/音源标签 */
export const CoverStage = memo(function CoverStageBase({
    artwork,
    title,
    artist,
    platform,
    maxSize,
}: CoverStageProps) {
    // 封面取可用宽高较小值成正方，随底部控件挤压自适应缩放、不溢出；平板再按 maxSize 封顶
    const [box, setBox] = useState({ w: 0, h: 0 });
    const fitted = Math.min(box.w, box.h);
    const size = maxSize === undefined ? fitted : Math.min(fitted, maxSize);
    const onArtLayout = (e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        setBox(prev =>
            prev.w === width && prev.h === height
                ? prev
                : { w: width, h: height },
        );
    };
    return (
        <View style={styles.wrap}>
            <View style={styles.artArea} onLayout={onArtLayout}>
                <PlayerCoverArt artwork={artwork} size={size} />
            </View>
            <View style={styles.meta}>
                <Text
                    size="2xl"
                    weight="bold"
                    color="coverText"
                    lineHeight="tight"
                    numberOfLines={2}
                >
                    {title}
                </Text>
                <View style={styles.subline}>
                    {artist ? (
                        <Text
                            size="md"
                            color="coverTextSecondary"
                            lineHeight="tight"
                            numberOfLines={1}
                            style={styles.artist}
                        >
                            {artist}
                        </Text>
                    ) : null}
                    {platform ? (
                        <Tag
                            label={platform}
                            tone="cover"
                            accessibilityLabel={platform}
                            style={styles.platform}
                        />
                    ) : null}
                </View>
            </View>
        </View>
    );
});

const styles = StyleSheet.create({
    wrap: {
        flex: 1,
    },
    artArea: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    meta: {
        marginTop: space.md,
        // 固定高度稳住封面尺寸；内容顶对齐，标题短时留白落在副行下方
        height: META_HEIGHT,
    },
    // 艺术家 + 音源同一行：艺术家可缩、音源标签保宽（xs 不超 md 行高，META_HEIGHT 不变）
    subline: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        marginTop: space.sm,
    },
    artist: {
        flexShrink: 1,
    },
    platform: {
        maxWidth: '45%',
    },
});
