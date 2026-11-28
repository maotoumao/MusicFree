import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

/** 系统门的授予态 */
export interface SystemGateState {
    /** undefined 表示还没查出来（首帧），此时不该断言「未授予」 */
    granted: boolean | undefined;
    /** 主动复查：请求已返回确定结果时用，不必干等回前台 */
    refresh: () => void;
}

/**
 * 系统门（电池优化白名单 / 存储访问 / 悬浮窗）的授予态：挂载即查、回前台复检
 *
 * 这些开关都在系统设置里改，期间 App 退到后台——回前台复检是唯一能收敛到真实态的时机。
 * 不用导航的 focus：整个过程用户没离开过这一屏，focus 不会重新触发
 */
export function useSystemGateGranted(
    check: () => Promise<boolean>,
): SystemGateState {
    const [granted, setGranted] = useState<boolean | undefined>(undefined);
    // 调用方通常直接传箭头函数，进依赖数组会每帧重装监听。放提交后更新，不在渲染期改共享 ref
    const checkRef = useRef(check);
    useEffect(() => {
        checkRef.current = check;
    });
    // 只认最后一次发起的查询：回前台复检可能与上一次尚未返回的查询乱序完成
    const seqRef = useRef(0);

    const sync = useCallback((): void => {
        const seq = ++seqRef.current;
        const settle = (value: boolean): void => {
            if (seq === seqRef.current) {
                setGranted(value);
            }
        };
        // 查不出来按未授予处理：多给一次「去授权」的入口，好过让用户以为已经开了
        const fail = (): void => settle(false);
        try {
            checkRef.current().then(settle, fail);
        } catch {
            fail(); // 同步抛出（桥不可用等）
        }
    }, []);

    useEffect(() => {
        sync();
        const sub = AppState.addEventListener('change', state => {
            if (state === 'active') {
                sync();
            }
        });
        return () => sub.remove();
    }, [sync]);

    return { granted, refresh: sync };
}
