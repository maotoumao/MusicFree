import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import qrCodeSource from '@/assets/images/official-account-qr.png';
import { definePanel, showToast } from '@/components/overlay';
import { IconButton, iconButtonEdgeInset } from '@/components/ui/IconButton';
import { Image } from '@/components/ui/Image';
import { Markdown } from '@/components/ui/Markdown';
import { Text } from '@/components/ui/Text';
import { layout, radius, space } from '@/design';
import { useOrientation } from '@/hooks/useOrientation';
import { useT } from '@/i18n';
import { officialLinks } from '@/utils/officialLinks';

import type { OverlayProps } from '@/components/overlay';

/** 内嵌二维码块边长（dp）：图片自带静区，这就是含白边的总尺寸 */
const INLINE_QR_BLOCK = 160;

/**
 * 逐字原文的前两段，一个字都不改
 * 末尾那个向下的手势指的就是紧随其后的二维码，所以正文在此断开
 */
const WORDS_BEFORE_QR = `软件作者是**猫头猫**🐱，不是猫头鹰🦉，也不是什么其他的奇奇怪怪。软件没有其他版本，如果你下载到了付费版/广告版/挂羊头卖狗肉版，那说明你被坏蛋骗了😒。

软件相关信息会发布在公众号【**一只猫头猫**】中👇，也简单做了个[官方网站](${officialLinks.website})。（手机版和桌面版的）下载地址、使用方式、插件开发方式、常见问题都在站点中。`;

/** 逐字原文的后三段 */
const WORDS_AFTER_QR = `**还请注意本软件只是个人的业余项目，距离稳定版也有很长一段距离。**如果你在找成熟稳定的音乐软件，可以考虑其他优秀的软件。当然我会一直维护，让它变得尽可能的完善一些。业余时间用爱发电，进度慢还请见谅。

如果有问题或者建议，可以直接去 Github issue 区留言，也可以去公众号【一只猫头猫】留言，也可以去 [QQ 频道](${officialLinks.qqChannel}) 发帖。

开发这个软件的最初目的是自用，顺便分享出来给有需要的人。如果这个软件能对你有些帮助，那这就是 MusicFree 存在的意义。`;

/**
 * 「开发者的话」面板：作者的自述，逐字引用，一个字都不改写
 * 排版只决定怎么显示——加粗位置、段落顺序、二维码插在哪一段之后，都照原文
 */
function DeveloperWordsPanelView({ close }: OverlayProps<void, void>) {
    const t = useT();
    const landscape = useOrientation() === 'landscape';

    const openLink = (url: string) => {
        Linking.openURL(url).catch(() => {
            showToast(t('feedback.openLinkFailed'), { type: 'error' });
        });
    };

    return (
        <View style={landscape ? styles.fill : undefined}>
            <View style={styles.header}>
                <Text
                    size="lg"
                    weight="bold"
                    numberOfLines={1}
                    accessibilityRole="header"
                    style={styles.title}
                >
                    {t('developerWordsPanel.title')}
                </Text>
                <IconButton
                    icon="x"
                    tone="textSecondary"
                    onPress={() => close()}
                    accessibilityLabel={t('common.close')}
                />
            </View>
            <ScrollView
                style={landscape ? styles.fill : styles.scrollShrink}
                contentContainerStyle={styles.body}
            >
                <Markdown
                    source={WORDS_BEFORE_QR}
                    onOpenLink={openLink}
                    linkAccessibilityHint={t(
                        'developerWordsPanel.a11y.linkHint',
                    )}
                />

                {/* 紧跟上一段：原文末尾那个向下的手势在字面上要求二维码出现在这个位置 */}
                <View style={styles.qrRow}>
                    <Image
                        source={qrCodeSource}
                        style={styles.qrCode}
                        contentFit="contain"
                        accessibilityLabel={t('developerWordsPanel.a11y.qr')}
                    />
                    <Text size="sm" color="textSecondary" style={styles.qrHint}>
                        {t('developerWordsPanel.scanHint')}
                    </Text>
                </View>

                <Markdown
                    source={WORDS_AFTER_QR}
                    onOpenLink={openLink}
                    linkAccessibilityHint={t(
                        'developerWordsPanel.a11y.linkHint',
                    )}
                />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    fill: {
        flex: 1,
    },
    /**
     * 高度归 Panel 壳管（它已限到窗口八成并含底部安全区）
     * 这里只声明「空间不够时我可以被压缩」——Yoga 的 flexShrink 默认是 0，
     * 不声明就会溢出被壳裁掉，底部内容既看不见也滚不到
     */
    scrollShrink: {
        flexShrink: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: layout.screenGutter,
        /** 右端是贴边关闭按钮，外推后图标本体落回内容线 */
        paddingRight: iconButtonEdgeInset(layout.screenGutter),
        marginBottom: space.sm,
    },
    title: {
        flex: 1,
        marginRight: space.sm,
    },
    body: {
        gap: space.md,
        paddingHorizontal: layout.screenGutter,
        paddingBottom: space.xl,
    },
    // 二维码在上、说明在下，作为一个整体水平居中
    qrRow: {
        flexDirection: 'column',
        alignItems: 'center',
        gap: space.md,
        marginBottom: space.xs,
    },
    qrHint: {
        textAlign: 'center',
    },
    // 图片自带白底静区，直接显示即可；圆角只裁静区的四角，不碰码本身
    qrCode: {
        width: INLINE_QR_BLOCK,
        height: INLINE_QR_BLOCK,
        borderRadius: radius.md,
    },
});

/** 「开发者的话」面板：作者区列表行的去处 */
export const showDeveloperWordsPanel = definePanel(DeveloperWordsPanelView);
