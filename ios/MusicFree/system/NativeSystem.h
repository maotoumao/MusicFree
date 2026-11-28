//
//  NativeSystem.h
//  MusicFree —— System TurboModule iOS 空壳（New Architecture）
//
//  iOS 无「进程硬退出 / 电池优化白名单 / 全文件访问 / 多存储卷」概念：
//  exitApp no-op，读方法 resolve(YES)、请求方法 resolve(nil)、卷枚举 resolve(@[])。
//
//  BLIND-WRITE: 以下 codegen 边界符号均需 Mac 上 `pod install` 生成 MusicFreeSpecs 后核对：
//   - 协议名 NativeSystemSpec、JSI 类 NativeSystemSpecJSI、umbrella 头 <MusicFreeSpecs/...>
//     （NativeSystem 与 audio 共用同一 codegenConfig，故同库同 umbrella）
//   - 并把本 .h/.mm 加入 Xcode 工程 build phase（否则 iOS 运行时 NativeSystem 找不到）
//

#import <Foundation/Foundation.h>
#import <MusicFreeSpecs/MusicFreeSpecs.h>

NS_ASSUME_NONNULL_BEGIN

@interface NativeSystem : NSObject <NativeSystemSpec>
@end

NS_ASSUME_NONNULL_END
