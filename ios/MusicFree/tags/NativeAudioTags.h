//
//  NativeAudioTags.h
//  MusicFree —— 音频 tag 读写 TurboModule iOS 空壳（New Architecture）
//
//  iOS 真实实现留后续里程碑；当前 stub 让 iOS 可加载不崩（bootstrap 无条件装配 core）。
//  所有方法一律 reject("E_UNSUPPORTED_PLATFORM", ...)。
//
//  BLIND-WRITE: 以下 codegen 边界符号需 Mac 上 `pod install` 生成 MusicFreeSpecs 后核对：
//   - 协议名 NativeAudioTagsSpec、JSI 类 NativeAudioTagsSpecJSI、umbrella <MusicFreeSpecs/...>
//     （与 audio 共用同一 codegenConfig，故同库同 umbrella）
//   - 并把本 .h/.mm 加入 Xcode 工程 build phase（否则 iOS 运行时找不到本模块）
//

#import <Foundation/Foundation.h>
#import <MusicFreeSpecs/MusicFreeSpecs.h>

NS_ASSUME_NONNULL_BEGIN

@interface NativeAudioTags : NSObject <NativeAudioTagsSpec>
@end

NS_ASSUME_NONNULL_END
