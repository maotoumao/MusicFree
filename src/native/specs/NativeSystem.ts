import { TurboModuleRegistry, type TurboModule } from 'react-native';

/**
 * OS 系统集成桥：只放 RN 与 react-native-permissions 都不覆盖、
 * 必须走系统 Intent / 系统服务读写 / 窗口级系统 UI 控制的 OS 级 app 门与动作
 * —— 进程硬退出、电池优化白名单、全文件访问（MANAGE_EXTERNAL_STORAGE）、存储卷枚举、沉浸式系统栏
 * 划界：凡 RN（Linking/Dimensions/BackHandler…）或 rn-permissions（标准运行时权限）
 * 已覆盖的一律不进，避免退化成杂物抽屉
 * iOS：exitApp / setImmersiveSystemBars 为 no-op（后者 iOS 侧只藏状态栏、由 JS 走 RN StatusBar，见 infra/systemBars），其余 resolve(true)
 */

/**
 * 设备上的一个外部存储卷（内置共享存储 / SD 卡等可移动卷）
 * 只报能定位到根目录的卷：拿不到 directory 的（未挂载 / 系统不给）不出现在结果里
 */
export interface StorageVolumeInfo {
    /** 卷根目录绝对路径（如 /storage/emulated/0、/storage/1A2B-3C4D），无尾斜杠 */
    path: string;
    /** 系统给的可读卷名（如「SD 卡」）；取不到为空串，兜底文案由 UI 定 */
    name: string;
    /** 是否主共享存储（内置） */
    isPrimary: boolean;
    /** 是否可移动（SD 卡 / U 盘） */
    isRemovable: boolean;
    /** 此刻是否已挂载可读（未挂载的卷仍可能出现在列表里，其下路径不可达） */
    isMounted: boolean;
}

/** OS 门与动作契约 */
export interface Spec extends TurboModule {
    /** 硬退出：停前台 Service + finishAndRemoveTask + killProcess（iOS no-op） */
    exitApp(): void;

    /** 是否已在电池优化白名单（Android < M 恒 true；iOS true） */
    isIgnoringBatteryOptimizations(): Promise<boolean>;
    /** 直达本应用「忽略电池优化」请求页（Android < M / iOS no-op） */
    requestIgnoreBatteryOptimizations(): Promise<void>;

    /** 是否已授予全文件访问（Android R+ 判 MANAGE_EXTERNAL_STORAGE，< R 判读写权限；iOS true） */
    isAllFilesAccessGranted(): Promise<boolean>;
    /** 直达本应用「全文件访问」设置页（iOS no-op） */
    requestAllFilesAccess(): Promise<void>;

    /**
     * 枚举外部存储卷（内置 + SD 卡等）；无卷或非 Android 回空数组
     * 属 OS 级系统服务读（StorageManager），RN 与 rn-permissions 均不覆盖，故收在此桥
     */
    getStorageVolumes(): Promise<StorageVolumeInfo[]>;

    /** 是否已授予「显示在其他应用上层」权限（Settings.canDrawOverlays；Android < M / iOS 恒 true） */
    canDrawOverlays(): Promise<boolean>;
    /** 打开「显示在其他应用上层」设置页（尽量定位本应用，R+ 可能落到全局列表；Android < M / iOS no-op） */
    openOverlaySettings(): Promise<void>;

    /**
     * 沉浸式系统栏：true = 藏掉状态栏与导航栏（两栏 inset 归零），用户从边缘滑出的栏只作临时覆盖、
     * 几秒后自动收回，那一次不派发 insets（内容不位移）；false = 恢复常驻显示与默认行为
     * RN 的 StatusBar 只管状态栏、导航栏显隐 RN 未暴露，两栏要整体进出故收在此桥；iOS no-op
     */
    setImmersiveSystemBars(enabled: boolean): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeSystem');
