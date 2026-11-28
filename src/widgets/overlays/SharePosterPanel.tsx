/**
 * 分享海报面板：占位实现
 *
 * 海报画面改为真正的 Skia 生成图之前的过渡态——展示一张打包好的静态图，
 * 保存/分享走真实逻辑（相册写入 + 系统分享），避免 MusicItemOptionsPanel 的
 * 「分享」调用悬空
 */
import {
    CachesDirectoryPath,
    copyFileRes,
    downloadFile,
    exists,
} from '@dr.pogodin/react-native-fs';
import {
    Image as RNImage,
    Platform,
    StyleSheet,
    useWindowDimensions,
    View,
} from 'react-native';
import { openSettings } from 'react-native-permissions';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import sharePosterImage from '@/assets/images/share-poster.jpg';
import { defineFullScreen, showToast } from '@/components/overlay';
import { Button } from '@/components/ui/Button';
import { Image } from '@/components/ui/Image';
import { layout, radius, space } from '@/design';
import { useT } from '@/i18n';
import {
    requestPhotoLibraryWriteAccess,
    saveImageToPhotoLibrary,
} from '@/infra/photoLibrary';
import { shareImage } from '@/infra/share';
import { showConfirmDialog } from '@/widgets/overlays/ConfirmDialog';

import type { OverlayProps } from '@/components/overlay';
export interface SharePosterPayload {
    title: string;
    artist?: string;
    /** 封面地址；静态图版本待定是否使用 */
    artwork?: string;
}

/** 海报画幅 2:3 */
const POSTER_ASPECT = 2 / 3;
/** 海报封顶宽（dp）：再宽就不像一张可分享的卡片 */
const POSTER_MAX_WIDTH = 400;
/** 海报与按钮组的横向外距（dp） */
const HORIZONTAL_PADDING = space['3xl'];
/** 海报上下的呼吸留白（dp）：矮窗口里靠它保证海报与按钮不贴边 */
const VERTICAL_PADDING = space.xl;

/**
 * 海报宽（dp，纯计算）：同时受可用宽、可用高、封顶三者约束
 *
 * 不能写 `width:'100%' + maxWidth + aspectRatio`：Yoga 先按 100% 父宽算出高，再把宽夹到 maxWidth，
 * 高却不跟着缩——父宽一超过 400（平板、手机横屏）海报就成了裁掉两侧的细长条。
 * 可用高扣掉按钮行、按钮与海报的间距、上下呼吸留白后，按画幅折回宽
 */
export function sharePosterWidthFor(
    availableWidth: number,
    availableHeight: number,
): number {
    const byWidth = availableWidth - HORIZONTAL_PADDING * 2;
    const byHeight =
        (availableHeight -
            layout.controlHeight.md -
            space.xl -
            VERTICAL_PADDING * 2) *
        POSTER_ASPECT;
    // 不取整：手机上要与旧的 100% − 2×48 逐像素相同（含小数宽）
    return Math.max(0, Math.min(POSTER_MAX_WIDTH, byWidth, byHeight));
}

/**
 * 按钮组宽（dp，纯计算）：只受可用宽与封顶约束，不跟海报一起被高度压缩——
 * 矮窗口里海报可以缩成一小张，两个带文案的按钮不能
 */
export function sharePosterActionsWidthFor(availableWidth: number): number {
    return Math.max(
        0,
        Math.min(POSTER_MAX_WIDTH, availableWidth - HORIZONTAL_PADDING * 2),
    );
}

// 占位实现下海报就是这张打包好的静态图；resolveAssetSource 取其可访问 uri——
// dev 环境是打包器 http 地址，Android release 是 drawable 资源名，iOS release 是本地文件
const posterImageUri = RNImage.resolveAssetSource(sharePosterImage).uri;
const posterCachePath = `${CachesDirectoryPath}/share-poster-preview.jpg`;

/**
 * 拿到海报图片的真实本地文件路径
 *
 * expo-sharing / expo-media-library 只认 file:// 真实文件；Metro 地址需下载落盘，
 * Android release 的 drawable 资源需复制落盘。已缓存过则直接复用
 */
async function resolvePosterFilePath(): Promise<string> {
    if (posterImageUri.startsWith('file://')) {
        return posterImageUri;
    }
    if (await exists(posterCachePath)) {
        return posterCachePath;
    }
    if (Platform.OS === 'android' && !posterImageUri.includes('://')) {
        await copyFileRes(`${posterImageUri}.jpg`, posterCachePath);
        return posterCachePath;
    }
    const { statusCode } = await downloadFile({
        fromUrl: posterImageUri,
        toFile: posterCachePath,
    }).promise;
    if (statusCode < 200 || statusCode >= 300) {
        throw new Error(`下载海报图失败：HTTP ${statusCode}`);
    }
    return posterCachePath;
}

function SharePosterPanelView({ payload }: OverlayProps<SharePosterPayload>) {
    const t = useT();
    const { width, height } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    // 全屏壳不吃安全区，可用尺寸自己扣
    const availableWidth = width - insets.left - insets.right;
    const posterWidth = sharePosterWidthFor(
        availableWidth,
        height - insets.top - insets.bottom,
    );
    const posterSize = {
        width: posterWidth,
        height: posterWidth / POSTER_ASPECT,
    };
    const actionsWidth = sharePosterActionsWidthFor(availableWidth);

    const saveImage = async () => {
        const access = await requestPhotoLibraryWriteAccess();
        if (access !== 'granted') {
            if (access === 'blocked') {
                const go = await showConfirmDialog({
                    title: t('sharePosterPanel.writePermission.title'),
                    message: t('sharePosterPanel.writePermission.message'),
                    confirmText: t(
                        'sharePosterPanel.writePermission.openSettings',
                    ),
                });
                if (go) {
                    await openSettings().catch(() => {});
                }
            } else {
                showToast(t('sharePosterPanel.writePermission.denied'), {
                    type: 'info',
                });
            }
            return;
        }
        try {
            const path = await resolvePosterFilePath();
            await saveImageToPhotoLibrary(path, 'MusicFree');
            showToast(t('feedback.saved'), { type: 'success' });
        } catch (ex) {
            console.log(ex);
            showToast(t('feedback.operationFailed'), { type: 'error' });
        }
    };

    const sharePoster = async () => {
        try {
            const path = await resolvePosterFilePath();
            await shareImage(path, payload.title);
        } catch (ex) {
            console.log(ex);
            showToast(t('feedback.operationFailed'), { type: 'error' });
        }
    };

    return (
        <View pointerEvents="box-none" style={styles.root}>
            <Image
                source={sharePosterImage}
                style={[styles.poster, posterSize]}
            />
            <View
                testID="share-poster-actions"
                style={[styles.buttonGroup, { width: actionsWidth }]}
            >
                <Button
                    style={styles.button}
                    tone="neutral"
                    onPress={saveImage}
                >
                    {t('sharePosterPanel.saveImage')}
                </Button>
                <Button
                    style={styles.button}
                    tone="primary"
                    onPress={sharePoster}
                >
                    {t('sharePosterPanel.shareImage')}
                </Button>
            </View>
        </View>
    );
}

/** 打开分享海报面板 */
export const showSharePosterPanel = defineFullScreen(SharePosterPanelView, {
    backdropEffect: 'blur',
});

const styles = StyleSheet.create({
    root: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.xl,
        paddingHorizontal: HORIZONTAL_PADDING,
        paddingVertical: VERTICAL_PADDING,
    },
    // 宽高由 sharePosterWidthFor 现算（确定数值），这里只留形状
    poster: {
        borderRadius: radius.lg,
    },
    buttonGroup: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: space.md,
    },
    button: {
        flex: 1,
    },
});
