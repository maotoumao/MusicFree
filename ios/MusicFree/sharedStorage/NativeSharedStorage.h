//
//  NativeSharedStorage.h
//  MusicFree —— SharedStorage TurboModule iOS 实现（New Architecture）
//
//  BLIND-WRITE：MusicFreeSpecs 生成的基类名（NativeSharedStorageSpecBase）与协议名
//  需在 Mac 上 pod install 后核对；本文件与 .mm 均未加入 pbxproj，接入随其余原生文件一并进行。
//

#import <Foundation/Foundation.h>
#import <MusicFreeSpecs/MusicFreeSpecs.h>

NS_ASSUME_NONNULL_BEGIN

@interface NativeSharedStorage : NSObject <NativeSharedStorageSpec>

@end

NS_ASSUME_NONNULL_END
