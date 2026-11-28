/**
 * 沉浸式系统栏：整页藏掉状态栏与导航栏（常驻隐藏，两栏的 inset 随之归零、内容铺满）；用户从边缘滑出的栏
 * 只作临时覆盖、几秒后自动收回，**那一次**不派发 insets、内容不位移——视频播放器那种全屏
 *
 * 为什么要自己走原生桥，而不是复用已有的两条路：
 * - RN 的 `StatusBar` 只管状态栏（edge-to-edge 下 hide 时也会设 sticky 行为），导航栏的显隐 RN 没有暴露；
 *   两栏要作为一个整体进出，故收在一处、把行为也显式写死，不依赖别处顺带设下的值
 * - react-native-screens 的 native-stack `statusBarHidden` / `navigationBarHidden` 看似现成，但任何一个
 *   screen 设过 `statusBarHidden`，它就把 `didSetStatusBarAppearance` 置成全局 true，此后每次切屏都用默认
 *   `"light"` 重设状态栏图标样式（ScreenWindowTraits.setStyle），覆盖掉本仓 40 处 `Screen` 靠
 *   `<StatusBar barStyle>` 跟主题走的逻辑——那是一次全 App 级迁移，不是本页一处开关
 *
 * iOS 只藏状态栏，走 RN 的 StatusBar 栈条目（push / pop 配对，与其他持有方互不覆盖；plist 已关
 * VC-based 外观，故真的生效）。刘海 iPhone 横屏的状态栏高本就是 0，所以手机横屏这一形态在 iOS 上拿不到
 * 高度收益，真正会看到变化的是 iPad 台前调度那类被判成 phone 的窄窗口。home indicator 的自动隐藏需要
 * VC 级 `prefersHomeIndicatorAutoHidden`，本仓根 VC 是 RN 的，本刀不做，属知情取舍
 */
import { StatusBar } from 'react-native';

import { os } from '@/infra/device';
import systemGates from '@/infra/systemGates';

/** 进入沉浸；返回对称的退出函数，调用方在作用域结束时调用 */
export function enterImmersiveSystemBars(): () => void {
    if (os === 'android') {
        systemGates.setImmersiveSystemBars(true);
        return () => systemGates.setImmersiveSystemBars(false);
    }
    const entry = StatusBar.pushStackEntry({ hidden: true });
    return () => StatusBar.popStackEntry(entry);
}
