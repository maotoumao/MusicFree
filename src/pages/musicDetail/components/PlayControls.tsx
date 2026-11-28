import { memo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePressAnimation } from '@/components/hooks/usePressAnimation';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Spinner } from '@/components/ui/Spinner';
import {
    PlaybackState,
    RepeatMode,
    player,
    usePlaybackState,
    useRepeatMode,
} from '@/core/player';
import { pressScale, useColors } from '@/design';
import { useT } from '@/i18n';
import { showPlayQueuePanel } from '@/widgets/overlays/PlayQueuePanel';

import {
    PLAYER_PLAY_SIZE_COMPACT,
    PLAYER_PLAY_SIZE_DENSE,
    PLAYER_PLAY_SIZE_REGULAR,
    playControlsMinWidth,
} from '../lib/layout';

import type { IconName } from '@/components/ui/icons.generated';
import type { LayoutChangeEvent, ViewStyle } from 'react-native';

const REPEAT_ICON: Record<RepeatMode, IconName> = {
    [RepeatMode.Queue]: 'repeat',
    [RepeatMode.Single]: 'repeat-1',
    [RepeatMode.Shuffle]: 'shuffle',
};
const REPEAT_KEY: Record<RepeatMode, 'queue' | 'loop' | 'shuffle'> = {
    [RepeatMode.Queue]: 'queue',
    [RepeatMode.Single]: 'loop',
    [RepeatMode.Shuffle]: 'shuffle',
};

/**
 * 主播放键三档（dp）
 * - regular：竖屏 / 平板，64 的暖橙圆是页面唯一强调焦点
 * - compact：短窗口（手机横屏 / 分屏），56 仍明显高过 44 命中线
 * - dense：分栏形态的条带档（≈220dp 高的多窗口），收到命中地板本身，让整行只占 44
 */
export type PlayControlsScale = 'regular' | 'compact' | 'dense';

const PLAY_SIZE: Record<PlayControlsScale, number> = {
    regular: PLAYER_PLAY_SIZE_REGULAR,
    compact: PLAYER_PLAY_SIZE_COMPACT,
    dense: PLAYER_PLAY_SIZE_DENSE,
};
const PLAY_ICON_SIZE: Record<PlayControlsScale, number> = {
    regular: 28,
    compact: 24,
    dense: 20,
};
/** 忙碌态 Spinner 与静态图标同档，否则进缓冲那一刻圆里的图形会先胀一下 */
const PLAY_SPINNER_SIZE: Record<PlayControlsScale, 'md' | 'lg'> = {
    regular: 'lg',
    compact: 'lg',
    dense: 'md',
};
/** 圆直径随档位变 → 只能算不能进 StyleSheet；表在模块级建一次，渲染不造新对象 */
const PLAY_SHAPE: Record<PlayControlsScale, ViewStyle> = {
    regular: circle(PLAY_SIZE.regular),
    compact: circle(PLAY_SIZE.compact),
    dense: circle(PLAY_SIZE.dense),
};

function circle(size: number): ViewStyle {
    return { width: size, height: size, borderRadius: size / 2 };
}

/** 主播放/暂停键：暖橙实心圆，唯一强调焦点 */
function PlayButton({
    inPlayback,
    busy,
    label,
    scale,
    onPress,
}: {
    inPlayback: boolean;
    busy: boolean;
    label: string;
    scale: PlayControlsScale;
    onPress: () => void;
}) {
    const colors = useColors();
    const { animatedStyle, onPressIn, onPressOut } = usePressAnimation(
        pressScale.subtle,
    );
    return (
        <Pressable
            onPress={onPress}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ busy }}
        >
            <Animated.View
                style={[
                    styles.play,
                    PLAY_SHAPE[scale],
                    {
                        backgroundColor: colors.coverAccentStrong,
                        shadowColor: colors.coverAccentStrong,
                    },
                    animatedStyle,
                ]}
            >
                {busy ? (
                    <Spinner
                        size={PLAY_SPINNER_SIZE[scale]}
                        color="onCoverAccentStrong"
                    />
                ) : (
                    <Icon
                        name={inPlayback ? 'pause' : 'play'}
                        size={PLAY_ICON_SIZE[scale]}
                        color="onCoverAccentStrong"
                    />
                )}
            </Animated.View>
        </Pressable>
    );
}

/** 播放控制：循环 · 上一首 · 播放/暂停 · 下一首 · 队列 */
export const PlayControls = memo(function PlayControlsBase({
    scale = 'regular',
}: {
    /** 主播放键档位（默认 regular = 竖屏 64） */
    scale?: PlayControlsScale;
}) {
    const t = useT();
    const state = usePlaybackState();
    const repeatMode = useRepeatMode();
    /**
     * 五个键都是定尺寸、RN 默认不收缩，行宽不够就会横向溢出。极窄窗口（320dp 宽再带
     * 横屏刘海）确实放不下五个，故自量行宽、不够就收掉循环键——它是五个里唯一在别处
     * 还有入口的（播放队列面板头部）。自量而非由调用方传：这一行在五个形态里都出现，
     * 各自算一遍宽度会散成五份账，而这里只关心「我自己这一行够不够」
     */
    const [rowWidth, setRowWidth] = useState(0);
    const onRowLayout = (e: LayoutChangeEvent) => {
        const next = e.nativeEvent.layout.width;
        setRowWidth(prev => (prev === next ? prev : next));
    };
    const tight =
        rowWidth > 0 && rowWidth < playControlsMinWidth(PLAY_SIZE[scale]);

    // 播放意图（含缓冲 / 加载）→ 主键走暂停；仅暂停 / 停止 / 空闲 / 错误才走播放
    const inPlayback =
        state === PlaybackState.Playing ||
        state === PlaybackState.Buffering ||
        state === PlaybackState.Loading;
    const busy =
        state === PlaybackState.Buffering || state === PlaybackState.Loading;

    return (
        <View style={styles.row} onLayout={onRowLayout}>
            {tight ? null : (
                <IconButton
                    icon={REPEAT_ICON[repeatMode]}
                    size="lg"
                    tone="coverTextSecondary"
                    edgeAlign="start"
                    accessibilityLabel={t(
                        `media.repeatMode.${REPEAT_KEY[repeatMode]}`,
                    )}
                    onPress={() => player.toggleRepeatMode().catch(() => {})}
                />
            )}
            <IconButton
                icon="skip-back"
                size="lg"
                tone="coverText"
                edgeAlign={tight ? 'start' : undefined}
                accessibilityLabel={t('musicDetail.a11y.previous')}
                onPress={() => player.skipToPrevious().catch(() => {})}
            />
            <PlayButton
                inPlayback={inPlayback}
                busy={busy}
                scale={scale}
                label={
                    inPlayback
                        ? t('musicDetail.a11y.pause')
                        : t('musicDetail.a11y.play')
                }
                onPress={() => {
                    if (inPlayback) {
                        player.pause().catch(() => {});
                    } else {
                        player.play().catch(() => {});
                    }
                }}
            />
            <IconButton
                icon="skip-forward"
                size="lg"
                tone="coverText"
                accessibilityLabel={t('musicDetail.a11y.next')}
                onPress={() => player.skipToNext().catch(() => {})}
            />
            <IconButton
                icon="list-music"
                size="lg"
                tone="coverTextSecondary"
                edgeAlign="end"
                accessibilityLabel={t('musicDetail.a11y.queue')}
                onPress={() => showPlayQueuePanel()}
            />
        </View>
    );
});

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    // 直径由 PLAY_SHAPE 按档位补上
    play: {
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 8,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.5,
        shadowRadius: 14,
    },
});
