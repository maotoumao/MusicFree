import { useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';

import type { ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

/**
 * 看门狗时长：正常放行靠 transitionEnd，这里只防事件因故缺席导致内容永不挂载
 * 必须显著大于实测转场耗时（dev 下最长约 1.5s），否则会抢在转场前放行、把挂载又塞回动画里
 */
const WATCHDOG_MS = 2500;

/**
 * 本屏进场转场是否已结束（对应浮层侧的 useOverlayStatus().entered）
 * 重内容（长列表等）等它为 true 再挂，原生转场就能立刻起步、不被挂载工作堵住
 * 一旦为 true 不再回退；退场方向的转场事件不放行，避免返回途中反而去挂内容
 */
export function useScreenEntered(): boolean {
    // 只用到 native-stack 的转场事件，与具体路由无关，故不绑定路由表
    const navigation =
        useNavigation<NativeStackNavigationProp<ParamListBase>>();
    const [entered, setEntered] = useState(false);

    useEffect(() => {
        // 置位后 effect 重跑：先清掉上一轮的监听与定时器，再从此不再订阅
        if (entered) {
            return;
        }
        const unsubscribe = navigation.addListener('transitionEnd', event => {
            if (!event.data.closing) {
                setEntered(true);
            }
        });
        const watchdog = setTimeout(() => {
            setEntered(true);
        }, WATCHDOG_MS);
        return () => {
            unsubscribe();
            clearTimeout(watchdog);
        };
    }, [navigation, entered]);

    return entered;
}
