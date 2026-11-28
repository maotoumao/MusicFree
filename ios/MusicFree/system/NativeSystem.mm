//
//  NativeSystem.mm
//  MusicFree —— System TurboModule iOS 空壳实现（New Architecture）
//
//  iOS 无对应 OS 门：exitApp no-op（Apple 禁程序化退出）；电池优化 / 全文件访问在 iOS
//  无此概念，读方法一律 resolve(YES)、请求方法 resolve(nil)；无多存储卷概念，卷枚举回空数组。
//  BLIND-WRITE：NativeSystemSpec / NativeSystemSpecJSI 名与 getTurboModule 签名需 Mac 上
//  pod install 生成 MusicFreeSpecs 后核对（见 .h）。
//

#import "NativeSystem.h"

@implementation NativeSystem

RCT_EXPORT_MODULE()

- (void)exitApp {
    // iOS 无法程序化退出，no-op
}

- (void)isIgnoringBatteryOptimizations:(RCTPromiseResolveBlock)resolve
                                reject:(RCTPromiseRejectBlock)reject {
    resolve(@YES);
}

- (void)requestIgnoreBatteryOptimizations:(RCTPromiseResolveBlock)resolve
                                   reject:(RCTPromiseRejectBlock)reject {
    resolve(nil);
}

- (void)isAllFilesAccessGranted:(RCTPromiseResolveBlock)resolve
                        reject:(RCTPromiseRejectBlock)reject {
    resolve(@YES);
}

- (void)requestAllFilesAccess:(RCTPromiseResolveBlock)resolve
                       reject:(RCTPromiseRejectBlock)reject {
    resolve(nil);
}

- (void)getStorageVolumes:(RCTPromiseResolveBlock)resolve
                   reject:(RCTPromiseRejectBlock)reject {
    // iOS 只有 app 沙盒，无可枚举的外部存储卷
    resolve(@[]);
}

- (void)canDrawOverlays:(RCTPromiseResolveBlock)resolve
                 reject:(RCTPromiseRejectBlock)reject {
    resolve(@YES);
}

- (void)openOverlaySettings:(RCTPromiseResolveBlock)resolve
                     reject:(RCTPromiseRejectBlock)reject {
    resolve(nil);
}

- (void)setImmersiveSystemBars:(BOOL)enabled {
    // iOS 状态栏由 JS 侧走 RN 的 StatusBar 栈条目处理；home indicator 的自动隐藏需要 VC 级
    // prefersHomeIndicatorAutoHidden，根 VC 是 RN 的，本桥不做（知情取舍），此处 no-op
}

#pragma mark - TurboModule

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
    return std::make_shared<facebook::react::NativeSystemSpecJSI>(params);
}

@end
