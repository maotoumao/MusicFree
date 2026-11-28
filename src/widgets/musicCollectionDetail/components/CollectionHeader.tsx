import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Image } from '@/components/ui/Image';
import { Text } from '@/components/ui/Text';
import {
    layout,
    radius,
    space,
    useColors,
    useHasBackgroundLayer,
    usePageFade,
} from '@/design';
import { useContentGutter } from '@/hooks/useContentColumn';
import { useT } from '@/i18n';
import { colord } from '@/utils/color';
import { firstNonBlank } from '@/utils/text';

import type {
    CollectionHeader as CollectionHeaderData,
    CollectionStarCapability,
} from '../types';

/** 全出血封面高（伸到状态栏下）；导出供编排层设 AppBar 转实底的阈值 */
export const COVER_HEIGHT = 262;
/** 封面底部渐隐高：由封面淡入页面基底，让正文与封面平滑衔接（基底是模糊壁纸时需要更长过渡） */
const COVER_FADE_HEIGHT = 140;
/** 接缝下方把加浓的幕布收回页面浓度的高度；只在有壁纸时用到 */
const SEAM_TAIL_HEIGHT = 96;
/** 无封面兜底图标圆底的幕布浓度：固定值，不随用户调的控件不透明度变 */
const FALLBACK_SHELL_ALPHA = 0.45;

interface CollectionHeaderProps {
    header: CollectionHeaderData;
    /** 收藏能力；缺省 → 不渲染收藏按钮，标题独占整行 */
    star?: CollectionStarCapability;
    /** 描述超两行时点整行 → 开描述面板 */
    onPressDescription(): void;
}

/** 标题行右端的收藏切换：surface 圆底衬出可点，实心心形 + 主色 + toggle 读屏态共同表达「已收藏」（横屏侧栏复用） */
export function StarButton({ star }: { star: CollectionStarCapability }) {
    const colors = useColors();
    const t = useT();
    return (
        <View style={[styles.starShell, { backgroundColor: colors.surface }]}>
            <IconButton
                icon={star.isStarred ? 'heart-filled' : 'heart'}
                tone={star.isStarred ? 'primary' : 'text'}
                busy={star.isPending}
                disabled={star.isPending}
                checked={star.isStarred}
                onPress={star.onToggle}
                accessibilityLabel={t('musicCollectionDetail.a11y.star')}
            />
        </View>
    );
}

/**
 * 集合详情头部：全出血封面 + 标题 + 描述可点行 + 创建者（纯 prop 驱动，换肤隔离单元）
 * 封面故意不吃 top inset（伸到状态栏下）；ImmersiveAppBar 浮其上
 */
export function CollectionHeader({
    header,
    star,
    onPressDescription,
}: CollectionHeaderProps) {
    const colors = useColors();
    const hasThemedBackground = useHasBackgroundLayer();
    // 渐变终点＝页面自己画出的那一层（无背景=不透明底色，有背景=底色幕布），壁纸从末端无缝接上
    const fade = usePageFade();
    const { artwork, fallbackIcon, title, description, creator, details } =
        header;
    // 空串 / 纯空白视作无封面（不把空源交给 Image 加载出空白）
    const artworkUri = firstNonBlank(artwork);
    // 记失败的具体 URL（非布尔）：源变新值即重试，不因旧 URL 失败永久遮盖新封面 / 头像
    const [failedArtwork, setFailedArtwork] = useState<string>();
    const [failedAvatar, setFailedAvatar] = useState<string>();
    // 描述超两行才给「展开」列（点开面板）；短文本纯展示、无 chevron
    const [descOverflow, setDescOverflow] = useState(false);
    // 平板：正文块内容线 16 → 32，与下方媒体行同一条线（手机 undefined、styles.body 原样）
    const gutter = useContentGutter();

    // 仅当前 URL 失败才回退（源换新即重试）
    const coverFailed =
        artworkUri !== undefined && failedArtwork === artworkUri;
    const hasCover = artworkUri !== undefined && !coverFailed;
    // 有壁纸且无封面时 band 本身就是壁纸，无物可渐隐；再叠幕布只会在下沿切出一条更暗的边
    const showFade = hasCover || !hasThemedBackground;
    const avatarFailed =
        creator?.avatar !== undefined && failedAvatar === creator.avatar;

    return (
        <View>
            {/* 无封面兜底：有自定义背景时不铺实色板（那会在渐变末端切出硬边），让壁纸自己充当头图 */}
            <View
                style={[
                    styles.cover,
                    hasThemedBackground
                        ? null
                        : { backgroundColor: colors.surfaceVariant },
                ]}
            >
                {hasCover ? (
                    // key=URL：源变化时卸载旧原生实例、取消在途请求，杜绝旧 onError 误标新源失败
                    <Image
                        key={artworkUri}
                        source={artworkUri}
                        style={StyleSheet.absoluteFill}
                        onError={() => setFailedArtwork(artworkUri)}
                    />
                ) : (
                    // 有壁纸时兜底图标直接压在壁纸上，给它一层圆底才保得住可辨。
                    // 用固定浓度的底色幕布而非 surfaceVariant：后者会被控件不透明度拉到接近全透
                    <View
                        style={[
                            styles.fallbackShell,
                            hasThemedBackground
                                ? {
                                      backgroundColor: colord(colors.background)
                                          .alpha(FALLBACK_SHELL_ALPHA)
                                          .toRgbString(),
                                  }
                                : null,
                        ]}
                    >
                        <Icon
                            name={fallbackIcon}
                            size={72}
                            color="textSecondary"
                        />
                    </View>
                )}
                {showFade ? (
                    <LinearGradient
                        colors={fade.colors}
                        locations={fade.locations}
                        style={styles.fade}
                        pointerEvents="none"
                    />
                ) : null}
            </View>
            {/* 接缝下方把加浓的幕布收回页面浓度：图像切换发生在幕布最浓处，两侧一致。
                与渐隐带同门控——不画渐隐时接缝上下本就都是壁纸、没有接缝，
                单独画收尾反而会在 band 下沿凭空切出一级台阶 */}
            {showFade && fade.tailColors ? (
                <LinearGradient
                    colors={fade.tailColors}
                    style={styles.seamTail}
                    pointerEvents="none"
                />
            ) : null}
            <View style={gutter ? [styles.body, gutter] : styles.body}>
                <View style={styles.titleRow}>
                    <Text
                        size="2xl"
                        weight="bold"
                        numberOfLines={2}
                        style={styles.title}
                    >
                        {title}
                    </Text>
                    {star ? <StarButton star={star} /> : null}
                </View>
                {creator || details.length > 0 ? (
                    <View style={styles.meta}>
                        {creator ? (
                            <View style={styles.creatorRow}>
                                {creator.avatar && !avatarFailed ? (
                                    <Image
                                        key={creator.avatar}
                                        source={creator.avatar}
                                        style={[
                                            styles.avatar,
                                            {
                                                backgroundColor:
                                                    colors.surfaceVariant,
                                            },
                                        ]}
                                        onError={() =>
                                            setFailedAvatar(creator.avatar)
                                        }
                                    />
                                ) : creator.avatar ? (
                                    <View
                                        style={[
                                            styles.avatar,
                                            styles.avatarFallback,
                                            {
                                                backgroundColor:
                                                    colors.surfaceVariant,
                                            },
                                        ]}
                                    >
                                        <Icon
                                            name="user-round"
                                            size="sm"
                                            color="textSecondary"
                                        />
                                    </View>
                                ) : null}
                                <Text
                                    size="md"
                                    color="textSecondary"
                                    numberOfLines={1}
                                    style={styles.creatorName}
                                >
                                    {creator.name}
                                </Text>
                            </View>
                        ) : null}
                        {details.length > 0 ? (
                            <Text
                                size="md"
                                color="textSecondary"
                                numberOfLines={1}
                            >
                                {details.join(' · ')}
                            </Text>
                        ) : null}
                    </View>
                ) : null}
                {description ? (
                    <>
                        <View
                            style={styles.descMeasure}
                            pointerEvents="none"
                            accessibilityElementsHidden
                            importantForAccessibility="no-hide-descendants"
                        >
                            <Text
                                size="sm"
                                onTextLayout={e =>
                                    setDescOverflow(
                                        e.nativeEvent.lines.length > 2,
                                    )
                                }
                            >
                                {description}
                            </Text>
                        </View>
                        {descOverflow ? (
                            <Pressable
                                style={styles.descRow}
                                onPress={onPressDescription}
                                accessibilityRole="button"
                            >
                                <Text
                                    size="sm"
                                    color="textSecondary"
                                    numberOfLines={2}
                                    style={styles.desc}
                                >
                                    {description}
                                </Text>
                                <Icon
                                    name="chevron-right"
                                    size={18}
                                    color="textSecondary"
                                />
                            </Pressable>
                        ) : (
                            <Text
                                size="sm"
                                color="textSecondary"
                                numberOfLines={2}
                                style={styles.descPlain}
                            >
                                {description}
                            </Text>
                        )}
                    </>
                ) : null}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    cover: {
        width: '100%',
        height: COVER_HEIGHT,
        alignItems: 'center',
        justifyContent: 'center',
    },
    fade: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: COVER_FADE_HEIGHT,
    },
    seamTail: {
        position: 'absolute',
        top: COVER_HEIGHT,
        left: 0,
        right: 0,
        height: SEAM_TAIL_HEIGHT,
    },
    /** 无封面兜底图标的圆底：只在壁纸上需要 */
    fallbackShell: {
        padding: space.lg,
        borderRadius: radius.full,
    },
    body: {
        paddingHorizontal: space.lg,
        paddingTop: space.xs,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
    },
    title: {
        flex: 1,
    },
    /** 圆底衬在 background 上，让收藏读作可点控件而非标题旁的状态图标 */
    starShell: {
        borderRadius: radius.full,
    },
    descRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        marginTop: space.sm,
        minHeight: layout.hitTarget,
    },
    desc: {
        flex: 1,
    },
    descPlain: {
        marginTop: space.sm,
    },
    descMeasure: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        opacity: 0,
    },
    meta: {
        marginTop: space.sm,
        gap: space.xs,
    },
    creatorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
    },
    avatar: {
        width: 22,
        height: 22,
        borderRadius: radius.full,
    },
    avatarFallback: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    creatorName: {
        flexShrink: 1,
    },
});
