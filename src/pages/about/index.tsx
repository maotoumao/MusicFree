import { useNavigation } from '@react-navigation/native';
import { useEffect } from 'react';
import { Linking, ScrollView, StyleSheet } from 'react-native';

import authorAvatarSource from '@/assets/images/author-avatar.jpg';
import { AppBar } from '@/components/layout/AppBar';
import { PaperPane } from '@/components/layout/PaperPane';
import { Screen } from '@/components/layout/Screen';
import { showToast } from '@/components/overlay';
import { Icon } from '@/components/ui/Icon';
import { Image } from '@/components/ui/Image';
import { ListItem } from '@/components/ui/ListItem';
import { Section } from '@/components/ui/Section';
import { Text } from '@/components/ui/Text';
import { errorLog, useErrorRecords } from '@/core/errorLog';
import { layout, radius, space } from '@/design';
import { useBackAction } from '@/hooks/useBackAction';
import { useContentColumn } from '@/hooks/useContentColumn';
import { useT } from '@/i18n';
import { officialLinks } from '@/utils/officialLinks';
import { showDeveloperWordsPanel } from '@/widgets/overlays/DeveloperWordsPanel';
import { showOfficialAccountPanel } from '@/widgets/overlays/OfficialAccountPanel';
import { showRedistributionTermsPanel } from '@/widgets/overlays/RedistributionTermsPanel';
import { showThirdPartyLicensesPanel } from '@/widgets/overlays/ThirdPartyLicensesPanel';

import { AppIdentity } from './components/AppIdentity';
import { ChannelChip, ChannelChipRow } from './components/ChannelChips';

/** 作者头像边长（dp）：沿用列表内头像刻度，与身份行其余部分同高 */
const AVATAR_SIZE = 40;

/** package.json 的 license 字段实值；不写已废弃的 AGPL-3.0 */
const LICENSE_SPDX_ID = 'AGPL-3.0-only';

/**
 * 关于页：先说清这是谁做的、怎么找他，再给报障、官方渠道与协议条款的入口
 * 页面上的每个链接都是编译期常量，故直接打开浏览器，不弹「谨防钓鱼」确认
 */
export default function AboutScreen() {
    const t = useT();
    const back = useBackAction();
    // 平板：整页是一次线性阅读，限阅读宽（手机 undefined，样式原样）
    const column = useContentColumn('reading');
    const navigation = useNavigation();
    // 走 atom 而不是命令式读一次：本页在错误日志页之下保持挂载，
    // 从那里清空后返回时不会重渲染，命令式读到的条数会一直停在旧值
    const errorCount = useErrorRecords().length;

    // 读盘推迟到进页：启动路径全程不碰这个 store
    useEffect(() => {
        errorLog.getRecords();
    }, []);

    const openLink = (url: string) => {
        Linking.openURL(url).catch(() => {
            showToast(t('feedback.openLinkFailed'), { type: 'error' });
        });
    };

    const externalLinkIcon = (
        <Icon name="external-link" size="md" color="textDisabled" />
    );
    const detailIcon = (
        <Icon name="chevron-right" size="md" color="textDisabled" />
    );

    return (
        <Screen edges={['bottom']}>
            <AppBar
                title={t('common.about')}
                leading={back}
                contentWidth="reading"
            />
            <PaperPane width="reading">
                <ScrollView
                    contentContainerStyle={
                        column ? [styles.content, column] : styles.content
                    }
                >
                    <AppIdentity />

                    <Section title={t('about.section.author')}>
                        <ListItem
                            leading={
                                <Image
                                    source={authorAvatarSource}
                                    style={styles.avatar}
                                />
                            }
                            title={
                                <Text size="lg" weight="bold">
                                    {t('about.author.name')}
                                </Text>
                            }
                            // 头像 40 + 上下 8 = 56，与其余行等高；默认的 12 会撑到 64
                            dense
                        />
                        <ChannelChipRow>
                            <ChannelChip
                                icon="brand-wechat"
                                label={t('about.channel.officialAccount')}
                                onPress={() => {
                                    showOfficialAccountPanel().catch(() => {});
                                }}
                                accessibilityHint={t('about.a11y.qrCodeHint')}
                            />
                            <ChannelChip
                                icon="brand-bilibili"
                                label={t('about.channel.bilibili')}
                                onPress={() => openLink(officialLinks.bilibili)}
                                accessibilityHint={t(
                                    'about.a11y.externalLinkHint',
                                )}
                            />
                            <ChannelChip
                                icon="brand-xiaohongshu"
                                label={t('about.channel.xiaohongshu')}
                                onPress={() =>
                                    openLink(officialLinks.xiaohongshu)
                                }
                                accessibilityHint={t(
                                    'about.a11y.externalLinkHint',
                                )}
                            />
                        </ChannelChipRow>
                        <ListItem
                            title={
                                <Text>{t('about.author.developerWords')}</Text>
                            }
                            trailing={detailIcon}
                            trailingInline
                            dense
                            onPress={() => {
                                showDeveloperWordsPanel().catch(() => {});
                            }}
                            accessibilityHint={t('about.a11y.detailHint')}
                        />
                    </Section>

                    <Section title={t('about.section.feedback')}>
                        <ListItem
                            title={<Text>{t('errorLog.entry')}</Text>}
                            subtitle={
                                <Text size="sm" color="textSecondary">
                                    {errorCount > 0
                                        ? t('errorLog.count', {
                                              count: errorCount,
                                          })
                                        : t('errorLog.empty')}
                                </Text>
                            }
                            trailing={
                                <Icon
                                    name="chevron-right"
                                    size="md"
                                    color="textDisabled"
                                />
                            }
                            trailingInline
                            onPress={() => navigation.navigate('ErrorLog')}
                        />
                        <ListItem
                            title={<Text>{t('about.issue')}</Text>}
                            subtitle={
                                <Text size="sm" color="textSecondary">
                                    {t('about.issueChannel')}
                                </Text>
                            }
                            trailing={externalLinkIcon}
                            trailingInline
                            onPress={() => openLink(officialLinks.issues)}
                            accessibilityHint={t('about.a11y.externalLinkHint')}
                        />
                        <ListItem
                            title={
                                <Text>
                                    {t('about.channel.officialAccount')}
                                </Text>
                            }
                            subtitle={
                                <Text size="sm" color="textSecondary">
                                    {t('about.channel.officialAccountName')}
                                </Text>
                            }
                            trailing={
                                <Icon
                                    name="qr-code"
                                    size="md"
                                    color="textDisabled"
                                />
                            }
                            trailingInline
                            onPress={() => {
                                showOfficialAccountPanel().catch(() => {});
                            }}
                            accessibilityHint={t('about.a11y.qrCodeHint')}
                        />
                    </Section>

                    <Section title={t('about.section.channels')}>
                        <ListItem
                            title={<Text>{t('about.website')}</Text>}
                            subtitle={
                                <Text size="sm" color="textSecondary">
                                    {officialLinks.website}
                                </Text>
                            }
                            trailing={externalLinkIcon}
                            trailingInline
                            onPress={() => openLink(officialLinks.website)}
                            accessibilityHint={t('about.a11y.externalLinkHint')}
                        />
                        <ListItem
                            title={<Text>{t('about.repository')}</Text>}
                            subtitle={
                                <Text size="sm" color="textSecondary">
                                    {officialLinks.repository}
                                </Text>
                            }
                            trailing={externalLinkIcon}
                            trailingInline
                            onPress={() => openLink(officialLinks.repository)}
                            accessibilityHint={t('about.a11y.externalLinkHint')}
                        />
                    </Section>

                    <Section title={t('about.section.terms')}>
                        <ListItem
                            title={<Text>{t('about.license')}</Text>}
                            subtitle={
                                <Text size="sm" color="textSecondary">
                                    {LICENSE_SPDX_ID}
                                </Text>
                            }
                            trailing={externalLinkIcon}
                            trailingInline
                            onPress={() => openLink(officialLinks.license)}
                            accessibilityHint={t('about.a11y.externalLinkHint')}
                        />
                        <ListItem
                            title={
                                <Text>{t('about.redistributionTerms')}</Text>
                            }
                            trailing={detailIcon}
                            trailingInline
                            dense
                            onPress={() => {
                                showRedistributionTermsPanel().catch(() => {});
                            }}
                            accessibilityHint={t('about.a11y.detailHint')}
                        />
                        <ListItem
                            title={<Text>{t('about.thirdPartyLicenses')}</Text>}
                            trailing={detailIcon}
                            trailingInline
                            dense
                            onPress={() => {
                                showThirdPartyLicensesPanel().catch(() => {});
                            }}
                            accessibilityHint={t('about.a11y.detailHint')}
                        />
                    </Section>
                </ScrollView>
            </PaperPane>
        </Screen>
    );
}

const styles = StyleSheet.create({
    // 宽屏限宽居中：整页是一次线性阅读，行宽再长只会让眼睛来回扫
    content: {
        gap: space.lg,
        paddingBottom: space['3xl'],
        width: '100%',
        maxWidth: layout.listContentMaxWidth,
        alignSelf: 'center',
    },
    avatar: {
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
        borderRadius: radius.full,
    },
});
