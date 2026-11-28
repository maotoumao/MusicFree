//
//  NativeAudioTags.mm
//  MusicFree —— 音频 tag 读写 TurboModule iOS 空壳实现（New Architecture）
//
//  真实实现（TagLib + AudioTagStore 的 iOS 版）留后续里程碑；当前所有方法 reject。
//  返回走 Promise resolve/reject。
//  BLIND-WRITE 待 Mac 核对：writeTags 的 patch 具名对象参，RN 0.86 codegen 可能生成
//  `JS::NativeAudioTags::AudioTagPatch &`（struct 引用）而非 NSDictionary*——须按 pod install
//  后的实际生成头改签名，并把本 .h/.mm 加入 Xcode 工程 Sources build phase 才算完成。
//

#import "NativeAudioTags.h"

@implementation NativeAudioTags

RCT_EXPORT_MODULE()

static void rejectUnsupported(RCTPromiseRejectBlock reject) {
    reject(@"E_UNSUPPORTED_PLATFORM", @"audio tags not implemented on iOS yet", nil);
}

- (void)readTags:(NSString *)fileLocation
         resolve:(RCTPromiseResolveBlock)resolve
          reject:(RCTPromiseRejectBlock)reject {
    rejectUnsupported(reject);
}

- (void)readTagsBatch:(NSArray *)fileLocations
              resolve:(RCTPromiseResolveBlock)resolve
               reject:(RCTPromiseRejectBlock)reject {
    rejectUnsupported(reject);
}

- (void)writeTags:(NSString *)fileLocation
            patch:(NSDictionary *)patch
          resolve:(RCTPromiseResolveBlock)resolve
           reject:(RCTPromiseRejectBlock)reject {
    rejectUnsupported(reject);
}

- (void)extractPrimaryCover:(NSString *)fileLocation
                   destPath:(NSString *)destPath
                    resolve:(RCTPromiseResolveBlock)resolve
                     reject:(RCTPromiseRejectBlock)reject {
    rejectUnsupported(reject);
}

#pragma mark - TurboModule

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
    return std::make_shared<facebook::react::NativeAudioTagsSpecJSI>(params);
}

@end
