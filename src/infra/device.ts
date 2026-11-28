/** 设备 / 应用信息：包 react-native-device-info + RN Platform，供环境读（appVersion / os） */
import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';

/** 应用版本号（versionName / CFBundleShortVersionString） */
export const appVersion: string = DeviceInfo.getVersion();

/**
 * 构建号（versionCode / CFBundleVersion）
 * 错误报告靠它对上具体那次构建——source map 是逐次构建的产物，版本对不上会静默映射到错处
 */
export const buildNumber: string = DeviceInfo.getBuildNumber();

/** 运行平台 */
export const os: 'android' | 'ios' = Platform.OS === 'ios' ? 'ios' : 'android';

/** 系统版本（Android 版本号 / iOS 版本号）；仅用于诊断呈现 */
export const osVersion: string = DeviceInfo.getSystemVersion();

/** 设备型号；仅用于诊断呈现 */
export const deviceModel: string = DeviceInfo.getModel();
