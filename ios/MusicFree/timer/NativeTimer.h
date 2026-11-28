//
//  NativeTimer.h
//  MusicFree —— Timer TurboModule 纯桥（New Architecture）
//
//  后台可靠计时：串行 GCD queue + dispatch_after，进程存活期间触发（挂起顺延、不穿透进程死亡），
//  到点 emit onTimerFire。与 Android HandlerThread 版语义对齐。
//
//  BLIND-WRITE: 以下 codegen 边界符号需 Mac 上 `pod install` 生成 MusicFreeSpecs 后核对：
//   - 协议名 NativeTimerSpec、事件基类 NativeTimerSpecBase（带事件的模块须继承它才有 emitOnTimerFire:）、
//     JSI 类 NativeTimerSpecJSI、umbrella 头 <MusicFreeSpecs/...>
//     （与 audio/system 共用同一 codegenConfig，故同库同 umbrella）
//   - emit 方法名 emitOnTimerFire:（入参 NSDictionary *）、方法签名 setTimeout:ms: / clearTimeout:
//   - 并把本 .h/.mm 加入 Xcode 工程 target 的 build phase（否则 iOS 运行时找不到 NativeTimer）
//

#import <Foundation/Foundation.h>
#import <MusicFreeSpecs/MusicFreeSpecs.h>

NS_ASSUME_NONNULL_BEGIN

// 继承 SpecBase 才能拿到 codegen 的事件发射器（_eventEmitterCallback / emitOnTimerFire:）
@interface NativeTimer : NativeTimerSpecBase <NativeTimerSpec>
@end

NS_ASSUME_NONNULL_END
