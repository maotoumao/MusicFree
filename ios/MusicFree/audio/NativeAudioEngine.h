//
//  NativeAudioEngine.h
//  MusicFree —— Audio TurboModule 纯桥（New Architecture）
//
//  职责：实现 codegen 生成的 NativeAudioEngineSpec 协议，做 marshalling(codegen 类型 ↔ MFSlotItem)、
//  转发给 MFAudioEngine 单例、把引擎事件 emit 成 codegen JS 事件。无业务逻辑。
//
//  BLIND-WRITE: 以下 codegen 边界符号（umbrella 头名、协议名 NativeAudioEngineSpec、
//  事件基类 NativeAudioEngineSpecBase（带事件的模块须继承它才有 emitOnXxx:）、
//  C++ base NativeAudioEngineSpecJSI、emitOnXxx 方法名、object 参数是 NSDictionary 还是生成 struct）
//  均需 Mac 上 `pod install` 生成 MusicFreeSpecs 后核对调整。
//

#import <Foundation/Foundation.h>
#import <MusicFreeSpecs/MusicFreeSpecs.h>

NS_ASSUME_NONNULL_BEGIN

// 继承 SpecBase 才能拿到 codegen 的事件发射器（_eventEmitterCallback / emitOnXxx:）
@interface NativeAudioEngine : NativeAudioEngineSpecBase <NativeAudioEngineSpec>
@end

NS_ASSUME_NONNULL_END
