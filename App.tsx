import { ErrorBoundary } from '@/app/errorBoundary/ErrorBoundary';
import { RootNavigator } from '@/app/navigation/RootNavigator';
import { Providers } from '@/app/providers';

/** 应用根：组合根装配 Provider 树 + 导航；业务屏在 pages/，此处只做编排 */
function App() {
    return (
        // 最后一级：零共享依赖的兜底页。崩溃源头若就在主题 / i18n / 设计系统上，
        // 完整版会二次抛出，而这一层之上没有边界可接——那才是真白屏
        <ErrorBoundary variant="minimal">
            <Providers>
                {/* 内层接住绝大多数崩溃：此时 Providers 与设计系统都活着 */}
                <ErrorBoundary variant="full">
                    <RootNavigator />
                </ErrorBoundary>
            </Providers>
        </ErrorBoundary>
    );
}

export default App;
