/**
 * 桥接桌面歌词 core 与 UI / i18n：core 不 import 二者，故由 app 层在此代劳
 * 一是把 core 的 UI 请求事件接到面板 / 权限引导 / 导航，二是把浮层文案随语言推给 core
 * 启动订阅一次、随进程存活（不退订）
 */
import { AppState, ToastAndroid } from 'react-native';

import { showToast } from '@/components/overlay';
import { floatingLyric } from '@/core/floatingLyric';
import { localeAtom, t } from '@/i18n';
import { os } from '@/infra/device';
import { navigationRef } from '@/infra/navigation';
import systemGates from '@/infra/systemGates';
import { atomStore } from '@/utils/atomStore';
import { showConfirmDialog } from '@/widgets/overlays/ConfirmDialog';
import { showFloatingLyricSettingsPanel } from '@/widgets/overlays/FloatingLyricSettingsPanel';

/** 组装当前语言下的浮层文案（原生零文案，全部由此下发） */
function buildLabels(): Parameters<typeof floatingLyric.setLabels>[0] {
    return {
        openApp: t('floatingLyricOverlay.a11y.openApp'),
        close: t('floatingLyricOverlay.a11y.close'),
        lock: t('floatingLyricOverlay.a11y.lock'),
        settings: t('floatingLyricOverlay.a11y.settings'),
        play: t('floatingLyricOverlay.a11y.play'),
        pause: t('floatingLyricOverlay.a11y.pause'),
        previous: t('floatingLyricOverlay.a11y.previous'),
        next: t('floatingLyricOverlay.a11y.next'),
        textColor: t('floatingLyricOverlay.textColor'),
        fontSize: t('floatingLyricOverlay.fontSize'),
        fontSmaller: t('floatingLyricOverlay.a11y.fontSmaller'),
        fontLarger: t('floatingLyricOverlay.a11y.fontLarger'),
        lockedHint: t('floatingLyricOverlay.lockedHint'),
    };
}

/** 推一次浮层文案并订阅语言变化；须在 floatingLyric.setup 之前调用 */
export function syncFloatingLyricLabels(): void {
    floatingLyric.setLabels(buildLabels());
    atomStore.sub(localeAtom, () => {
        floatingLyric.setLabels(buildLabels());
    });
}

/**
 * 引导用户去系统设置授予悬浮窗权限：说明 Dialog → 跳系统页（跳转失败给 toast）
 * app 在后台时（通知栏点歌词按钮触发）走系统 toast：RN 的对话框渲染在看不见的地方，
 * 而系统文本 toast 不受前后台限制——Android 11 起屏蔽的是自定义 toast，文本 toast 照常
 */
async function guideOverlayPermission(): Promise<void> {
    if (os === 'android' && AppState.currentState !== 'active') {
        ToastAndroid.show(
            t('floatingLyricPermissionDialog.backgroundHint'),
            ToastAndroid.LONG,
        );
        return;
    }
    const ok = await showConfirmDialog({
        title: t('floatingLyricPermissionDialog.title'),
        message: t('floatingLyricPermissionDialog.message'),
        confirmText: t('floatingLyricPermissionDialog.confirm'),
    });
    if (ok) {
        try {
            await systemGates.openOverlaySettings();
        } catch {
            showToast(t('floatingLyricPermissionDialog.openSettingsFailed'), {
                type: 'error',
            });
        }
    }
}

/** 启动时订阅 core 的 UI 请求事件（随进程存活，不退订） */
export function subscribeFloatingLyricRequests(): void {
    floatingLyric.subscribeSettingsRequest(() => {
        showFloatingLyricSettingsPanel(undefined, { behavior: 'exclusive' });
    });
    floatingLyric.subscribePermissionRequest(() => {
        guideOverlayPermission().catch(() => {});
    });
    floatingLyric.subscribeOpenAppRequest(() => {
        // 导航树未就绪（冷启动途中）就跳过，用户落在启动后的默认页
        if (navigationRef.isReady()) {
            navigationRef.navigate('MusicDetail');
        }
    });
}
