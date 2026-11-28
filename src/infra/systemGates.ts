/**
 * OS 门与系统服务桥入口（exitApp / 电池优化 / 全文件访问 / 悬浮窗权限 / 存储卷枚举 / 沉浸式系统栏）
 * 正式代码从 `@/infra/systemGates` 用（或其上的 `permission`、`storageVolumes` 等门面），禁直接 import specs
 */
export { default } from '@/native/specs/NativeSystem';
