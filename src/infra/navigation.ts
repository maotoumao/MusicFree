import { createNavigationContainerRef } from '@react-navigation/native';

/**
 * 全局导航引用：给**导航树之外**的调用方用
 * overlay 内容渲染在 OverlayHost 里（NavigationContainer 的兄弟节点），拿不到导航 context，
 * 在其中调 useNavigation 会抛错——这类场景走本引用
 * 页面 / widget 在树内，仍用 useNavigation，别图省事走这里
 * 路由与参数类型由 app/navigation/routes.ts 的全局增强提供，故无需泛型参数
 */
export const navigationRef = createNavigationContainerRef();
