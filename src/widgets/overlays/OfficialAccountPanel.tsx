import { StyleSheet, View } from 'react-native';

import qrCodeSource from '@/assets/images/official-account-qr.png';
import { definePanel } from '@/components/overlay';
import { IconButton, iconButtonEdgeInset } from '@/components/ui/IconButton';
import { Image } from '@/components/ui/Image';
import { Text } from '@/components/ui/Text';
import { layout, radius, space } from '@/design';
import { useT } from '@/i18n';

import type { OverlayProps } from '@/components/overlay';

/** 二维码边长（dp）：足够多数机型直接扫到，又不至于把面板撑成整屏 */
const QR_SIZE = 240;

/**
 * 公众号二维码面板：作者区渠道胶囊与反馈行共用的同一个面
 * 图片自带白底与静区（扫码的前提），故不再套一层底板，也不随主题着色
 */
function OfficialAccountPanelView({ close }: OverlayProps<void, void>) {
    const t = useT();
    return (
        <View>
            <View style={styles.header}>
                <Text
                    size="lg"
                    weight="bold"
                    numberOfLines={1}
                    accessibilityRole="header"
                    style={styles.title}
                >
                    {t('officialAccountPanel.title')}
                </Text>
                <IconButton
                    icon="x"
                    tone="textSecondary"
                    onPress={() => close()}
                    accessibilityLabel={t('common.close')}
                />
            </View>
            <View style={styles.body}>
                <Image
                    source={qrCodeSource}
                    style={styles.qrCode}
                    contentFit="contain"
                    accessibilityLabel={t('officialAccountPanel.a11y.qr')}
                />
                <Text size="sm" color="textSecondary">
                    {t('officialAccountPanel.scanHint')}
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
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
        alignItems: 'center',
        gap: space.md,
        paddingHorizontal: layout.screenGutter,
        paddingBottom: space.xl,
    },
    // 图片自带白底静区，直接显示即可；圆角只裁静区的四角，不碰码本身
    qrCode: {
        width: QR_SIZE,
        height: QR_SIZE,
        borderRadius: radius.md,
    },
});

/** 公众号二维码面板：无参，页面上两个入口打开的是同一个面 */
export const showOfficialAccountPanel = definePanel(OfficialAccountPanelView);
