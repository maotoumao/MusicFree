/**
 * @format
 */

// 安全随机 polyfill：为 crypto.getRandomValues 供源（uuid / crypto-js 随机依赖它），须先于其它 import
import 'react-native-get-random-values';
import * as SplashScreen from 'expo-splash-screen';
import { AppRegistry } from 'react-native';

import { bootstrap } from '@/app/bootstrap';

import App from './App';
import { name as appName } from './app.json';

SplashScreen.setOptions({ duration: 300, fade: true });

// Hermes 默认只留十来帧，而 .stack 在抛出那一刻就定死、ErrorBoundary 拿到时补不回来。
// 放宽后深栈崩溃才有得查——报告要拿去离线 symbolicate，帧越全越好
Error.stackTraceLimit = 50;

// 启动序列首步：同步装配容器 + 异步加载插件（不阻塞首屏）
bootstrap();

AppRegistry.registerComponent(appName, () => App);
