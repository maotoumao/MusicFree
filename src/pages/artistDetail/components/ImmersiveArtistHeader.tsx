import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { Image } from '@/components/ui/Image';
import { Text } from '@/components/ui/Text';
import { layout, space, useColors } from '@/design';
import { useContentGutter } from '@/hooks/useContentColumn';
import { useT } from '@/i18n';
import { colord } from '@/utils/color';
import { showMediaDescriptionPanel } from '@/widgets/overlays/MediaDescriptionPanel';

import type { ArtistProfile } from '../hooks/useArtistDetailSource';

/** 沉浸封面高（伸到状态栏下）；导出供 scaffold 定 AppBar 转实底 / Tabs 吸顶阈值 */
export const ARTIST_COVER_HEIGHT = 280;
/** 兜底 user-round 直径（组件私有几何）：无 avatar 时封面视觉中心的大图标 */
const FALLBACK_ICON_SIZE = 76;

/**
 * 歌手沉浸封面头（供作品列表作 ListHeaderComponent，随各自列表滚动收起）
 * avatar 全出血 cover + 底部 mask scrim（保 coverText 可读）；name/事实/简介叠封面下部
 * 缺 avatar：surfaceVariant 封面槽 + 居中大 user-round（textSecondary），保持相同沉浸高度、不伪造宣传图
 */
export function ImmersiveArtistHeader({ profile }: { profile: ArtistProfile }) {
    const t = useT();
    const colors = useColors();
    const { name, avatar, fans, worksNum, description } = profile;
    // 记失败的具体 URL（非布尔）：源变新值即重试，不因旧 URL 失败永久遮盖新封面
    const [failedAvatar, setFailedAvatar] = useState<string>();
    // 简介超两行才给「展开」入口；短文本纯展示
    const [descOverflow, setDescOverflow] = useState(false);

    const avatarFailed = avatar !== undefined && failedAvatar === avatar;
    const showAvatarImage = avatar !== undefined && !avatarFailed;
    // 平板：文字叠层内容线 16 → 32，与下方作品行同一条线（手机 undefined、styles.overlay 原样）
    const gutter = useContentGutter();

    const facts = [
        fans != null ? t('artistDetail.fansCount', { count: fans }) : null,
        worksNum != null
            ? t('artistDetail.worksCount', { count: worksNum })
            : null,
    ]
        .filter(Boolean)
        .join(' · ');

    // scrim 平滑单调爬升（无实色平台）：同色相只变 alpha 从上沿透明柔和加深到底部——文字区够暗可读、不过度压暗头像、免硬边、越滚越不与顶 scrim 交叠死黑
    const scrimColors = [
        colord(colors.coverScrim).alpha(0).toRgbString(),
        colord(colors.coverScrim).alpha(0.4).toRgbString(),
        colord(colors.coverScrim).alpha(0.64).toRgbString(),
        colord(colors.coverScrim).alpha(0.8).toRgbString(),
    ] as const;
    const scrimLocations = [0, 0.35, 0.72, 1] as const;

    return (
        <View
            pointerEvents="box-none"
            style={[styles.cover, { backgroundColor: colors.surfaceVariant }]}
        >
            {showAvatarImage ? (
                // key=URL：源变化时卸载旧原生实例，杜绝旧 onError 误标新源失败
                <Image
                    key={avatar}
                    source={avatar}
                    contentFit="cover"
                    // transition=0：切 tab 时封面随列表重挂，命中缓存即时显示、不走淡入（免闪）
                    transition={0}
                    // 封面盖在列表上，滚动手势透传到下方列表（收起封面）
                    pointerEvents="none"
                    style={StyleSheet.absoluteFill}
                    onError={() => setFailedAvatar(avatar)}
                />
            ) : (
                <View
                    pointerEvents="none"
                    style={styles.fallback}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                >
                    <Icon
                        name="user-round"
                        size={FALLBACK_ICON_SIZE}
                        color="textSecondary"
                    />
                </View>
            )}
            <LinearGradient
                colors={scrimColors}
                locations={scrimLocations}
                style={styles.scrim}
                pointerEvents="none"
            />
            <View style={gutter ? [styles.overlay, gutter] : styles.overlay}>
                <Text
                    size="2xl"
                    weight="bold"
                    color="coverText"
                    numberOfLines={2}
                    accessibilityRole="header"
                >
                    {name}
                </Text>
                {facts ? (
                    <Text
                        size="sm"
                        color="coverText"
                        numberOfLines={1}
                        style={styles.facts}
                    >
                        {facts}
                    </Text>
                ) : null}
                {description ? (
                    <View style={styles.descBlock}>
                        {/* 隐藏测量全文行数（不占布局、不朗读）：仅据此决定是否给「展开」 */}
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
                            // 溢出：整行可点 + chevron 指示可展开（对齐集合详情简介行）
                            <Pressable
                                style={styles.descRow}
                                onPress={() =>
                                    showMediaDescriptionPanel({
                                        title: name,
                                        description,
                                    })
                                }
                                accessibilityRole="button"
                                accessibilityLabel={t(
                                    'artistDetail.a11y.expandDescription',
                                    { name },
                                )}
                            >
                                <Text
                                    size="sm"
                                    color="coverText"
                                    numberOfLines={2}
                                    style={styles.desc}
                                >
                                    {description}
                                </Text>
                                <Icon
                                    name="chevron-right"
                                    size={18}
                                    color="coverText"
                                />
                            </Pressable>
                        ) : (
                            <Text size="sm" color="coverText" numberOfLines={2}>
                                {description}
                            </Text>
                        )}
                    </View>
                ) : null}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    cover: {
        width: '100%',
        height: ARTIST_COVER_HEIGHT,
    },
    fallback: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scrim: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: '74%',
    },
    overlay: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: space.lg,
        paddingBottom: space.lg,
    },
    facts: {
        marginTop: space.xs,
    },
    descBlock: {
        marginTop: space.sm,
    },
    descMeasure: {
        position: 'absolute',
        left: 0,
        right: 0,
        opacity: 0,
    },
    descRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        minHeight: layout.hitTarget,
    },
    desc: {
        flex: 1,
    },
});
