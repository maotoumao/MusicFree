import {
    NavigationContainer,
    DarkTheme,
    DefaultTheme,
    type Theme,
} from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BlurTargetView } from 'expo-blur';
import { type ReactNode, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { ReduceMotion, ReducedMotionConfig } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemedBackground } from '@/components/layout/ThemedBackground';
import {
    OverlayHost,
    closeBlockingOverlays,
    useHasBlockingOverlay,
} from '@/components/overlay';
import { useColors } from '@/design';
import { useScreenReaderEnabled } from '@/hooks/useScreenReaderEnabled';
import { navigationRef } from '@/infra/navigation';
import { colord } from '@/utils/color';

import { DeferredInit } from './deferredInit';

import type { View as RNView } from 'react-native';

/** server state 默认策略基线；具体查询按需覆盖——易变结果（推荐/榜单）在自己的 useQuery 写 staleTime:0 */
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // 新鲜期：期内不重拉（同关键词二次搜索直接命中缓存）
            staleTime: 5 * 60 * 1000,
            // 离屏（无组件订阅）缓存保留时长，之后回收
            gcTime: 10 * 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
        },
    },
});

/** 由 design 语义色构建 react-navigation 主题：根底色/转场随浅深主题走，杜绝白闪 */
function useNavigationTheme(): Theme {
    const colors = useColors();
    const base = colord(colors.background).isDark() ? DarkTheme : DefaultTheme;
    return {
        ...base,
        colors: {
            ...base.colors,
            primary: colors.primary,
            background: colors.background,
            card: colors.surface,
            text: colors.text,
            border: colors.border,
            notification: colors.primary,
        },
    };
}

/**
 * 读屏隔离层：读屏开启且有阻断层时，把底层内容对读屏隐藏
 * iOS 用 accessibilityElementsHidden，Android 用 importantForAccessibility（accessibilityViewIsModal 仅 iOS，安卓需显式屏蔽）
 * 只在读屏真开时才切这个 prop——它挂在整棵导航树（含 react-native-screens）外层，一变就整树重提交、掉一帧白屏；
 * 读屏关时 hidden 恒 false、prop 不变、不闪（两个 hook 都无条件调用、仅结果做门控）
 */
function ScreenReaderShield({ children }: { children: ReactNode }) {
    const screenReaderOn = useScreenReaderEnabled();
    const blocking = useHasBlockingOverlay();
    const hidden = screenReaderOn && blocking;
    return (
        <View
            style={styles.root}
            accessibilityElementsHidden={hidden}
            importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
        >
            {children}
        </View>
    );
}

/** 组合根 Provider 树：手势 → 安全区 → Query → 导航容器（design 主题） */
export function Providers({ children }: { children: ReactNode }) {
    const navTheme = useNavigationTheme();
    const blurTarget = useRef<RNView | null>(null);
    return (
        <GestureHandlerRootView style={styles.root}>
            {/* 键盘避让基座：edge-to-edge 开着时库会自动置 status/navigationBar translucent + preserveEdgeToEdge
                （react-native-is-edge-to-edge 检测），无需显式传——显式传 __DEV__ 反而告警；preload 仅 iOS */}
            <KeyboardProvider preload={false}>
                {/* 跟随系统「减弱动态效果」无障碍开关 */}
                <ReducedMotionConfig mode={ReduceMotion.System} />
                <SafeAreaProvider>
                    <QueryClientProvider client={queryClient}>
                        <BlurTargetView ref={blurTarget} style={styles.root}>
                            <ThemedBackground>
                                <ScreenReaderShield>
                                    <NavigationContainer
                                        ref={navigationRef}
                                        theme={navTheme}
                                        onStateChange={closeBlockingOverlays}
                                    >
                                        {children}
                                    </NavigationContainer>
                                </ScreenReaderShield>
                            </ThemedBackground>
                        </BlurTargetView>
                        <DeferredInit />
                        {/* overlay 渲染根宿主：在 Query/SafeArea/Gesture 内、绝对定位盖住导航 */}
                        <OverlayHost blurTarget={blurTarget} />
                    </QueryClientProvider>
                </SafeAreaProvider>
            </KeyboardProvider>
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
