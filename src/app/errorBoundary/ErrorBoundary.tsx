/**
 * 渲染期异常的兜底：捕获、上报、交给 fallback 呈现
 *
 * 放 `app/` 而不是 `components/`——它要调 `core/errorLog` 上报，而分层规则里
 * `components/` 禁 import `core`；它本质上也是组合根的职责。
 *
 * 挂两处：`Providers` 外一层、内一层。绝大多数崩溃被内层接住（那时导航还在，
 * 能给「返回首页」）；外层只兜 Provider 自身炸掉的情况。
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

import { errorLog } from '@/core/errorLog';
import { navigationRef } from '@/infra/navigation';

import { copy } from './copy';
import { ErrorScreen } from './ErrorScreen';
import { MinimalErrorScreen } from './MinimalErrorScreen';

interface ErrorBoundaryProps {
    /**
     * `minimal` = 最后一级：只用 RN 原语与写死样式，零共享依赖。
     * 崩溃源头若在主题 / i18n / 设计系统上，完整版兜底页会二次抛出，
     * 而这一层之上已没有边界可接——退化成真白屏。
     * `full` = 内层：那时能确认 Providers 与设计系统都活着，可以好看且能回首页
     */
    variant: 'minimal' | 'full';
    children: ReactNode;
}

interface ErrorBoundaryState {
    error: Error | null;
}

/**
 * React 把**抛出值原样**交给边界——`getDerivedStateFromError(error: Error)` 的
 * 类型标注是骗人的。`throw null` 会让兜底页里的 `error.name` 再抛一次 TypeError，
 * 两级边界一起倒。故进门先归一成真 Error
 */
function toError(thrown: unknown): Error {
    if (thrown instanceof Error) {
        return thrown;
    }
    let described: string;
    try {
        described = String(thrown);
    } catch {
        described = '[无法转为文本的抛出值]';
    }
    return new Error(described);
}

export class ErrorBoundary extends Component<
    ErrorBoundaryProps,
    ErrorBoundaryState
> {
    override state: ErrorBoundaryState = { error: null };

    static getDerivedStateFromError(thrown: unknown): ErrorBoundaryState {
        return { error: toError(thrown) };
    }

    override componentDidCatch(thrown: unknown, info: ErrorInfo): void {
        const error = toError(thrown);
        // 上报本身绝不能再抛：那会把原始错误盖掉，还会让边界自己也崩
        try {
            errorLog.capture({
                source: 'render',
                error,
                componentStack: info.componentStack ?? undefined,
            });
        } catch {
            // 诊断失败不影响兜底页照常显示
        }
    }

    /**
     * 清掉错误态并回首页
     *
     * 派发必须**等重挂之后**：显示兜底页时 `RootNavigator` 已被卸载，
     * `isReady()` 就是「根导航器注册过 focus listener 没有」，那时恒为 false，
     * 直接派发会被静默跳过。今天看着能用只是因为容器重挂后落在第一个 Screen
     * 恰好是 Home——谁加个 initialRouteName 或状态持久化，人就被丢回刚崩的那屏
     */
    #goHome = (): void => {
        this.setState({ error: null }, () => {
            // setState 回调仍早于导航器的 passive effect，故再让一帧
            setTimeout(() => {
                if (navigationRef.isReady()) {
                    navigationRef.reset({
                        index: 0,
                        routes: [{ name: 'Home' }],
                    });
                }
            }, 0);
        });
    };

    override render(): ReactNode {
        const { error } = this.state;
        if (!error) {
            return this.props.children;
        }
        if (this.props.variant === 'minimal') {
            return (
                <MinimalErrorScreen error={error} onCopy={() => copy(error)} />
            );
        }
        return <ErrorScreen error={error} onGoHome={this.#goHome} />;
    }
}
