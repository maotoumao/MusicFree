import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';

import { enterImmersiveSystemBars } from '@/infra/systemBars';

/**
 * 本页聚焦期间进入沉浸式系统栏（藏状态栏 + 导航栏，滑出的栏只作临时覆盖、自动收回）；无渲染产出
 *
 * 作用域必须是「页面聚焦期」而不是「组件挂载期」：`RootNavigator` 是原生 stack、压屏时下面的
 * 路由不卸载，若按挂载期持有，从横屏播放页 `navigate('MusicComments')` / `navigate('EditLyric')`
 * 之后沉浸态会漏到评论页与歌词编辑页（浏览型 / 带键盘，正是不该沉浸的两类）。
 * 故走 `useFocusEffect`：被别的页压住即退出，弹回来再进入——与 `KeepScreenAwake` 同构
 *
 * 机制差异（Android 原生 vs iOS StatusBar 栈条目）收在 `infra/systemBars`，这里只管作用域
 */
export function ImmersiveSystemBars(): null {
    useFocusEffect(useCallback(() => enterImmersiveSystemBars(), []));

    return null;
}
