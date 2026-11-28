import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import { definePanel, showToast } from '@/components/overlay';
import { IconButton, iconButtonEdgeInset } from '@/components/ui/IconButton';
import { Markdown } from '@/components/ui/Markdown';
import { Text } from '@/components/ui/Text';
import { layout, space } from '@/design';
import { useOrientation } from '@/hooks/useOrientation';
import { useT } from '@/i18n';
import { officialLinks } from '@/utils/officialLinks';

import type { OverlayProps } from '@/components/overlay';

/**
 * 逐字原文，一个字都不改：第 2 条的半角分号与其后的空格、第 3 条冒号后直跟裸 URL
 * 且该 URL 保持纯文本（linkify 关着，不会被自动转成链接）、第 1 条与引导句的
 * `AGPL 3.0` / `AGPL3.0` 写法不一致——都是原文本来的样子，不做规范化
 */
const REDISTRIBUTION_TERMS = `本软件完全免费，并基于 **AGPL3.0 协议** 开源，如果需要使用此代码进行二次开发，请遵守如下约定：

1. 二次分发版必须同样遵循 AGPL 3.0 协议，开源且免费
2. 合法合规使用代码，不要用于商业用途; 修改后的软件造成的任何问题由使用此代码的开发者承担
3. 打包、二次分发时请保留代码出处：https://github.com/maotoumao/MusicFree
4. 如果开源协议变更，将在此 Github 仓库更新，不另行通知

代码已开源到 [Github](${officialLinks.repository})，如果打不开试试把链接中的 github 换成 gitcode。`;

/**
 * 「二次开发约定」面板：作者对二次开发者说的四条，逐字引用
 * 它与 GitHub 上的 AGPL 全文不可互相替代——那是英文法律文本，这是中文的具体约定
 */
function RedistributionTermsPanelView({ close }: OverlayProps<void, void>) {
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
                    {t('redistributionTermsPanel.title')}
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
                    source={REDISTRIBUTION_TERMS}
                    onOpenLink={openLink}
                    linkAccessibilityHint={t(
                        'redistributionTermsPanel.a11y.linkHint',
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
        paddingHorizontal: layout.screenGutter,
        paddingBottom: space.xl,
    },
});

/** 「二次开发约定」面板：开源与条款区的去处 */
export const showRedistributionTermsPanel = definePanel(
    RedistributionTermsPanelView,
);
