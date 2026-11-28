/** 屏幕常亮：包 expo-keep-awake（Android FLAG_KEEP_SCREEN_ON / iOS idleTimerDisabled） */
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

/** 申请常亮；同一 tag 需配对 release，多方各持各的 tag 互不干扰 */
export function acquireKeepAwake(tag: string): void {
    activateKeepAwakeAsync(tag).catch(e => {
        // 无可用 Activity 等异常路径：功能静默失效难排查，记录下来
        console.warn('[keepAwake] 申请失败', tag, e);
    });
}

/** 释放该 tag 的常亮；未持有时无副作用 */
export function releaseKeepAwake(tag: string): void {
    deactivateKeepAwake(tag).catch(e => {
        console.warn('[keepAwake] 释放失败', tag, e);
    });
}
