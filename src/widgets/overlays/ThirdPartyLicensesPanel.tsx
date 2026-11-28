import { FlashList, useRecyclingState } from '@shopify/flash-list';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePressFade } from '@/components/hooks/usePressFade';
import { definePanel } from '@/components/overlay';
import { Icon } from '@/components/ui/Icon';
import { IconButton, iconButtonEdgeInset } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { layout, space, useColors } from '@/design';
import { useOrientation } from '@/hooks/useOrientation';
import { useT } from '@/i18n';
import {
    licenseTexts,
    thirdPartyLicenses,
} from '@/utils/thirdPartyLicenses.generated';

import type { OverlayProps } from '@/components/overlay';
import type { ThirdPartyLicense } from '@/utils/thirdPartyLicenses.generated';

/** sheet 高度占窗口的比例：与 Panel 壳的上限一致，清单必然长过一屏，直接顶格 */
const SHEET_MAX_RATIO = 0.8;

function keyOf(item: ThirdPartyLicense): string {
    return `${item.platform}/${item.name}@${item.version}`;
}

/**
 * 一个包一行：折叠时是包名/协议/版权署名，展开后接上条款全文
 *
 * MIT、BSD 这类协议都要求许可条款随副本一同分发，链接到网上不算数，故全文内嵌。
 * 少数包的 npm 产物没带许可文本，由 scripts/licenseOverrides.json 人工补录，此处不必区分
 */
function LicenseRow({ item }: { item: ThirdPartyLicense }) {
    const t = useT();
    const colors = useColors();
    const { overlayStyle, onPressIn, onPressOut } = usePressFade();
    const [expanded, setExpanded] = useRecyclingState(false, [item]);
    const copyrights = item.copyrights?.join('\n') ?? '';
    const origin = t(`thirdPartyLicensesPanel.platform.${item.platform}`);
    return (
        <View>
            <Pressable
                onPress={() => setExpanded(prev => !prev)}
                onPressIn={onPressIn}
                onPressOut={onPressOut}
                // 整行合成一个读屏焦点：几百条若每条拆成三个焦点，逐个听完不现实
                accessible
                accessibilityRole="button"
                accessibilityLabel={[
                    item.name,
                    item.version,
                    origin,
                    item.license,
                    copyrights,
                ]
                    .filter(Boolean)
                    .join(' ')}
                accessibilityState={{ expanded }}
                style={styles.row}
            >
                <Animated.View
                    pointerEvents="none"
                    style={[
                        StyleSheet.absoluteFill,
                        { backgroundColor: colors.ripple },
                        overlayStyle,
                    ]}
                />
                <View style={styles.rowMain}>
                    <Text size="sm">{`${item.name} ${item.version}`}</Text>
                    <Text size="sm" color="textSecondary">
                        {`${origin} · ${item.license}`}
                    </Text>
                    {copyrights ? (
                        <Text size="xs" color="textDisabled">
                            {copyrights}
                        </Text>
                    ) : null}
                </View>
                <Icon
                    name={expanded ? 'chevron-up' : 'chevron-down'}
                    size="sm"
                    color="textSecondary"
                />
            </Pressable>
            {expanded ? (
                <Text
                    size="xs"
                    color="textSecondary"
                    lineHeight="relaxed"
                    style={styles.licenseText}
                >
                    {item.notice
                        ? `${licenseTexts[item.textIndex]}\n\n${item.notice}`
                        : licenseTexts[item.textIndex]}
                </Text>
            ) : null}
        </View>
    );
}

function renderItem({ item }: { item: ThirdPartyLicense }) {
    return <LicenseRow item={item} />;
}

/**
 * 第三方开源许可：本应用分发的包里含有这些第三方代码，逐条列出其协议、版权声明与条款全文
 *
 * 清单由 scripts/licenses.mjs 在构建期生成，一百多条，故走虚拟列表
 */
function ThirdPartyLicensesPanelView({ close }: OverlayProps<void, void>) {
    const t = useT();
    const landscape = useOrientation() === 'landscape';
    const { height: windowHeight } = useWindowDimensions();
    const insets = useSafeAreaInsets();

    // 壳的 border box 最多占窗口八成，且壳内还有上下内距；
    // 内容高度必须从壳的上限里把这些减掉，否则列表底部会被壳裁在屏幕外
    const portraitHeight = Math.max(
        0,
        Math.min(windowHeight * SHEET_MAX_RATIO, windowHeight - insets.top) -
            space.lg -
            insets.bottom -
            space.xl,
    );

    return (
        <View style={landscape ? styles.fill : { height: portraitHeight }}>
            <View style={styles.header}>
                <Text
                    size="lg"
                    weight="bold"
                    numberOfLines={1}
                    accessibilityRole="header"
                    style={styles.title}
                >
                    {t('thirdPartyLicensesPanel.title')}
                </Text>
                <IconButton
                    icon="x"
                    tone="textSecondary"
                    onPress={() => close()}
                    accessibilityLabel={t('common.close')}
                />
            </View>
            <View style={styles.fill}>
                <FlashList
                    data={thirdPartyLicenses}
                    keyExtractor={keyOf}
                    renderItem={renderItem}
                    contentContainerStyle={styles.listContent}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    fill: {
        flex: 1,
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
    listContent: {
        paddingHorizontal: layout.screenGutter,
        paddingBottom: space.xl,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        paddingVertical: space.sm,
    },
    rowMain: {
        flex: 1,
        gap: space.xs,
    },
    licenseText: {
        paddingBottom: space.md,
        // 条款是长段落，两端对齐避免右侧参差
        textAlign: 'justify',
    },
});

/** 第三方开源许可面板：开源与条款区的去处 */
export const showThirdPartyLicensesPanel = definePanel(
    ThirdPartyLicensesPanelView,
);
