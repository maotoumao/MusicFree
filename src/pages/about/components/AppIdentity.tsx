import { Pressable, StyleSheet, View } from 'react-native';

import appIconSource from '@/assets/images/app-icon.png';
import { showToast } from '@/components/overlay';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Image } from '@/components/ui/Image';
import { Text } from '@/components/ui/Text';
import { layout, opacity, radius, space } from '@/design';
import { useOrientation } from '@/hooks/useOrientation';
import { useT } from '@/i18n';
import { copyText } from '@/infra/clipboard';
import { appVersion } from '@/infra/device';

import { useCheckUpdate } from '../hooks/useCheckUpdate';

/** 产品名不进 i18n：它是标识本身，任何语言下都读作 MusicFree */
const APP_NAME = 'MusicFree';

/** 应用图标边长（dp）：全页最大的图形元素，与作者头像 40 拉开主次 */
const APP_ICON_SIZE = 64;

/** 横屏下的图标边长（dp）：垂直空间稀缺，缩一档配合横排 */
const APP_ICON_SIZE_LANDSCAPE = 56;

/**
 * 关于页抬头：应用图标、名称、可复制的版本行
 * 版本号是报障必带信息，给它一个显式的复制动作，而不是藏进长按
 * 横屏改横排：竖排居中会吃掉一半以上可视高度，首屏连一个功能行都露不出来
 */
export function AppIdentity() {
    const t = useT();
    const landscape = useOrientation() === 'landscape';
    const iconSize = landscape ? APP_ICON_SIZE_LANDSCAPE : APP_ICON_SIZE;
    const { checking, checkUpdate } = useCheckUpdate();

    const copyVersion = () => {
        copyText(`${APP_NAME} ${appVersion}`)
            .then(() => {
                showToast(t('about.versionCopied'), { type: 'success' });
            })
            .catch(() => {
                showToast(t('feedback.operationFailed'), { type: 'error' });
            });
    };

    return (
        <View style={[styles.root, landscape ? styles.rootLandscape : null]}>
            {/* 纯标识：名称由紧邻的文本承载，读屏再念一遍图标只是噪音 */}
            <Image
                source={appIconSource}
                style={[styles.icon, { width: iconSize, height: iconSize }]}
                contentFit="contain"
                pointerEvents="none"
            />
            <View style={landscape ? styles.textsLandscape : styles.texts}>
                <Text size="xl" weight="bold">
                    {APP_NAME}
                </Text>
                <Pressable
                    onPress={copyVersion}
                    onLongPress={copyVersion}
                    accessibilityRole="button"
                    accessibilityLabel={t('about.a11y.version', {
                        version: appVersion,
                    })}
                    accessibilityHint={t('about.a11y.versionHint')}
                    style={({ pressed }) => [
                        styles.version,
                        pressed ? { opacity: opacity.pressed } : null,
                    ]}
                >
                    <Text size="sm" color="textSecondary">
                        {appVersion}
                    </Text>
                    <Icon name="copy" size="sm" color="textDisabled" />
                </Pressable>
            </View>
            {/* 全页唯一的主动作：显式按钮，不再是旧版藏在头像上的隐藏手势 */}
            {/* 文案恒定：Button 在 loading 时把内容整块隐去、只留 Spinner，
                换成「检查中」既看不见又会让按钮宽度跳一下；忙碌状态由 accessibilityState 播报 */}
            <Button variant="soft" loading={checking} onPress={checkUpdate}>
                {t('about.update.check')}
            </Button>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        alignItems: 'center',
        gap: space.md,
        paddingHorizontal: layout.screenGutter,
        paddingVertical: space.xl,
    },
    rootLandscape: {
        flexDirection: 'row',
        gap: space.lg,
        paddingVertical: space.lg,
    },
    texts: {
        alignItems: 'center',
        gap: space.xs,
    },
    // 横屏把按钮推到行尾：竖排居中会吃掉一半以上可视高度
    textsLandscape: {
        flex: 1,
        alignItems: 'flex-start',
        gap: space.xs,
    },
    icon: {
        borderRadius: radius.xl,
    },
    // 命中区撑到 hitTarget：文字只有 sm，光靠文本高度点不准
    version: {
        minHeight: layout.hitTarget,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        paddingHorizontal: space.sm,
    },
});
