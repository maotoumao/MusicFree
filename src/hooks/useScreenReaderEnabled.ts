import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * 读屏（TalkBack / VoiceOver）是否开启（反应式：随系统无障碍开关更新）
 *
 * @param subscribe 传 false 则不订阅、恒返回 false。给「只在某个开关打开时才关心读屏」
 *   的消费方用——hook 不能条件调用，但可以条件订阅，免得每个实例都发一次桥调用 + 挂一个监听
 */
export function useScreenReaderEnabled(subscribe = true): boolean {
    const [enabled, setEnabled] = useState(false);
    useEffect(() => {
        if (!subscribe) {
            return;
        }
        let active = true;
        const sync = (value: boolean) => {
            if (active) {
                setEnabled(value);
            }
        };
        AccessibilityInfo.isScreenReaderEnabled()
            .then(sync)
            .catch(() => {});
        const sub = AccessibilityInfo.addEventListener(
            'screenReaderChanged',
            sync,
        );
        return () => {
            active = false;
            sub.remove();
        };
    }, [subscribe]);
    return subscribe && enabled;
}
