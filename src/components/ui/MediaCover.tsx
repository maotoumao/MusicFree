import { memo, useCallback, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { radius as radiusTokens, useColors } from '@/design';
import { clamp } from '@/utils/number';

import { Icon } from './Icon';
import { Image } from './Image';

import type { IconName } from './icons.generated';

interface MediaCoverProps {
    /** 封面 uri；非字符串 / 空白 / 加载失败 → 兜底图标 */
    source?: string;
    /** 缺图兜底图标（按媒体类型给：专辑 disc-3、歌手 user-round、歌单 list-music…） */
    fallbackIcon: IconName;
    /** 圆形封面（歌手 / 迷你条） */
    round?: boolean;
    /** 固定边长；省略 = 撑满父宽的正方形（网格 cell） */
    size?: number;
    /** 方形圆角，默认 md；round 时忽略 */
    radius?: number;
    /** 图片淡入过渡 ms；传 0 = 即时（如播放页大封面切歌不淡入）；默认走 Image 的 duration.fast */
    transition?: number;
}

/**
 * 兜底图标占比：随尺寸收敛 + 封顶，避免大封面里图标过大喧宾夺主
 * 固定 size 分档；fill 按量到的短边算
 */
function iconSizeFor(dimension: number, fill: boolean): number {
    if (fill) {
        return Math.round(clamp(dimension * 0.36, 28, 40));
    }
    if (dimension <= 48) {
        return Math.round(dimension * 0.5);
    }
    if (dimension <= 100) {
        return Math.round(dimension * 0.4);
    }
    return Math.min(Math.round(dimension * 0.28), 88);
}

/**
 * 媒体封面槽：有图加载、空 / 失败回退到 surfaceVariant 底 + 居中语义图标
 * key=URL 令每个源独立原生实例：失败 onError 正确归属该源、返回曾失败 URL 时重挂重试、列表回收不残留上一项封面
 * 纯 UI、主题无关；兜底图标为装饰、不入无障碍树
 */
export const MediaCover = memo(function MediaCoverBase({
    source,
    fallbackIcon,
    round = false,
    size,
    radius,
    transition,
}: MediaCoverProps) {
    const colors = useColors();
    const [failedUrl, setFailedUrl] = useState<string>();
    // fill 模式量到的短边，用于算图标尺寸；固定 size 时不需要
    const [measured, setMeasured] = useState(0);

    const uri = typeof source === 'string' ? source.trim() : undefined;
    const hasSource = uri != null && uri.length > 0;

    // 源变 = 新一次加载尝试：清失败态（含「返回曾失败的 URL」也重试）
    const [trackedUri, setTrackedUri] = useState(uri);
    if (trackedUri !== uri) {
        setTrackedUri(uri);
        setFailedUrl(undefined);
    }

    const showImage = hasSource && failedUrl !== uri;
    const fill = size == null;
    const shape = fill ? styles.fill : { width: size, height: size };
    const cornerRadius = round ? radiusTokens.full : radius ?? radiusTokens.md;
    const iconDimension = fill ? measured : size ?? 0;

    const onLayout = useCallback((e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        const short = Math.min(width, height);
        setMeasured(prev => (prev === short ? prev : short));
    }, []);

    const onError = useCallback(() => {
        if (uri != null) {
            setFailedUrl(uri);
        }
    }, [uri]);

    return (
        <View
            onLayout={fill ? onLayout : undefined}
            style={[
                shape,
                styles.center,
                {
                    borderRadius: cornerRadius,
                    backgroundColor: colors.surfaceVariant,
                },
            ]}
        >
            {showImage ? (
                // 加载间隙露 surfaceVariant 底（非空白）；缓存命中近即时
                <Image
                    key={uri}
                    source={uri}
                    style={StyleSheet.absoluteFill}
                    transition={transition}
                    onError={onError}
                />
            ) : (
                <Icon
                    name={fallbackIcon}
                    size={iconSizeFor(iconDimension, fill)}
                    color="textSecondary"
                />
            )}
        </View>
    );
});

const styles = StyleSheet.create({
    fill: { width: '100%', aspectRatio: 1 },
    center: {
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
});
