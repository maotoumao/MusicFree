//
//  NativeAudioEngine.mm
//  MusicFree —— Audio TurboModule 纯桥实现（New Architecture）
//
//  ============================ BLIND-WRITE 重点 ============================
//  本文件是唯一贴着 codegen 边界的文件，以下都需 Mac 上 `pod install` 生成
//  MusicFreeSpecs 后按实际产物核对：
//   1) object 参数（AudioItem/SetupOptions/AudioSource）在生成协议里是 NSDictionary
//      还是生成的 C++ struct（JS::NativeAudioEngine::AudioItem&）。此处按 **NSDictionary**
//      写（可读、marshalling 逻辑清晰）；若为 struct，需把各方法签名与取值改成 struct 访问器，
//      但 MFSlotFromDict / 事件字典结构可复用。
//   2) 事件 emit 方法名/入参形态（emitOnStateChange: 等）。
//   3) getTurboModule 的 JSI 类名 NativeAudioEngineSpecJSI。
//  纯桥无业务：只做 marshalling + 转发 MFAudioEngine + emit 事件。
//  =======================================================================
//

#import "NativeAudioEngine.h"
#import "MFAudioEngine.h"

#pragma mark - marshalling 辅助

static MFSlotItem *_Nullable MFSlotFromDict(NSDictionary *_Nullable d) {
    if (!d || d.count == 0) return nil;
    MFSlotItem *s = [MFSlotItem new];
    s.platform = d[@"platform"] ?: @"";
    s.itemId = d[@"id"] ?: @"";
    s.slotId = [d[@"slotId"] isKindOfClass:[NSNumber class]] ? [d[@"slotId"] longLongValue] : -1;
    s.cacheKey = d[@"cacheKey"] ?: [NSString stringWithFormat:@"%@_%@", s.platform, s.itemId];
    s.streamType = d[@"streamType"];
    s.title = d[@"title"];
    s.artist = d[@"artist"];
    s.album = d[@"album"];
    s.artwork = d[@"artwork"];
    s.duration = [d[@"duration"] isKindOfClass:[NSNumber class]] ? d[@"duration"] : nil;
    return s;
}

/// slot → dict（回带给 JS 的 AudioItem 快照）
static NSDictionary *MFDictFromSlot(MFSlotItem *s) {
    NSMutableDictionary *d = [@{@"platform": s.platform ?: @"", @"id": s.itemId ?: @"",
                                @"slotId": @(s.slotId), @"cacheKey": s.cacheKey ?: @""} mutableCopy];
    if (s.streamType) d[@"streamType"] = s.streamType;
    if (s.title) d[@"title"] = s.title;
    if (s.artist) d[@"artist"] = s.artist;
    if (s.album) d[@"album"] = s.album;
    if (s.artwork) d[@"artwork"] = s.artwork;
    if (s.duration) d[@"duration"] = s.duration;
    return d;
}

@interface NativeAudioEngine () <MFAudioEngineListener>
@end

@implementation NativeAudioEngine

RCT_EXPORT_MODULE()

- (instancetype)init {
    if (self = [super init]) {
        [MFAudioEngine shared].listener = self;
    }
    return self;
}

- (MFAudioEngine *)engine { return [MFAudioEngine shared]; }

#pragma mark - 同步 / 命令

- (NSString *)getEngineVersion { return [[self engine] engineVersion]; }

- (void)setup:(NSDictionary *)options
      resolve:(RCTPromiseResolveBlock)resolve
       reject:(RCTPromiseRejectBlock)reject {
    [self engine].listener = self;
    BOOL cacheEnabled = [options[@"cacheEnabled"] boolValue];
    long long maxCacheBytes = [options[@"maxCacheBytes"] longLongValue];
    double progressMs = options[@"progressIntervalMs"] ? [options[@"progressIntervalMs"] doubleValue] : 500;
    BOOL mixWithOthers = [options[@"mixWithOthers"] boolValue];
    [[self engine] setupCacheEnabled:cacheEnabled maxCacheBytes:maxCacheBytes progressIntervalMs:progressMs
                      mixWithOthers:mixWithOthers];
    // TODO(ST3): notification 外观选项（iOS 用 MPNowPlayingInfo，无小图标概念，多为 no-op）
    resolve(nil);
}

- (void)ackProgress:(double)deliveryId {
    if (isfinite(deliveryId)) [[self engine] acknowledgeProgressDeliveryId:(NSInteger)deliveryId];
}

- (void)provideSource:(double)requestId source:(NSDictionary *)source {
    NSString *url = source[@"url"];
    NSDictionary *headers = [source[@"headers"] isKindOfClass:[NSDictionary class]] ? source[@"headers"] : @{};
    [[self engine] provideSourceRequestId:(NSInteger)requestId url:url headers:headers];
}

- (void)setAudio:(NSDictionary *)item
        autoPlay:(BOOL)autoPlay
            next:(NSDictionary *)next
         resolve:(RCTPromiseResolveBlock)resolve
          reject:(RCTPromiseRejectBlock)reject {
    MFSlotItem *slot = MFSlotFromDict(item);
    if (!slot) { reject(@"E_ARG", @"setAudio: item required", nil); return; }
    [[self engine] setAudio:slot autoPlay:autoPlay next:MFSlotFromDict(next)];
    resolve(nil);
}

- (void)setNext:(NSDictionary *)next
        resolve:(RCTPromiseResolveBlock)resolve
         reject:(RCTPromiseRejectBlock)reject {
    [[self engine] setNext:MFSlotFromDict(next)];
    resolve(nil);
}

- (void)play:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject { [[self engine] play]; resolve(nil); }
- (void)pause:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject { [[self engine] pause]; resolve(nil); }
- (void)stop:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject { [[self engine] stop]; resolve(nil); }
- (void)reset:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject { [[self engine] reset]; resolve(nil); }

- (void)seekTo:(double)seconds resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [[self engine] seekToSeconds:seconds]; resolve(nil);
}
- (void)setRate:(double)rate resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [[self engine] setRate:rate]; resolve(nil);
}
- (void)getRate:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [[self engine] rateWithCompletion:^(double r) { resolve(@(r)); }];
}
- (void)setVolume:(double)volume resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [[self engine] setVolume:volume]; resolve(nil);
}

- (void)setMixWithOthers:(BOOL)enabled {
    [[self engine] setMixWithOthers:enabled];
}

- (void)getProgress:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [[self engine] progress:^(double position, double duration, double buffered) {
        resolve(@{@"position": @(position), @"duration": @(duration), @"buffered": @(buffered)});
    }];
}
- (void)getState:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    // getter 走主线程 completion：与先前命令串行排队，保 read-after-write 正确
    // （命令类 Promise 按“已受理” resolve；后续 engine 调用因主线程串行队自然排在其后）
    [[self engine] stateWithCompletion:^(NSString *s) { resolve(s); }];
}

- (void)updateMeta:(NSDictionary *)item
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject {
    [[self engine] updateMetaPlatform:item[@"platform"] itemId:item[@"id"]
                                title:item[@"title"] artist:item[@"artist"] artwork:item[@"artwork"]];
    resolve(nil);
}

// TODO 通知栏自定义按钮目前只有 Android 实现；iOS 的对应能力是 MPRemoteCommandCenter 的
// likeCommand / bookmarkCommand，语义与排布都不同，届时另设计。这里保持 no-op 让协议完整、调用方无需平台分支
- (void)setCustomNotificationButtons:(NSDictionary *)buttons {}

#pragma mark - 缓存

- (void)getCacheSize:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [[self engine] cacheSize:^(long long bytes) { resolve(@(bytes)); }];
}
- (void)clearCache:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [[self engine] clearCache:^{ resolve(nil); }];
}
- (void)removeCache:(NSDictionary *)item resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    MFSlotItem *slot = MFSlotFromDict(item);
    [[self engine] removeCacheKey:(slot.cacheKey ?: @"") completion:^{ resolve(nil); }];
}

#pragma mark - EQ（iOS 首版 stub 降级：返空/no-op，harness 会优雅处理）

- (void)eqGetBands:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject { resolve(@[]); }
- (void)eqSetBandGain:(double)index millibel:(double)millibel resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject { resolve(nil); }
- (void)eqSetEnabled:(BOOL)enabled resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject { resolve(nil); }
- (void)eqGetPresets:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject { resolve(@[]); }
- (void)eqUsePreset:(NSString *)name resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject { resolve(nil); }

#pragma mark - MFAudioEngineListener → emit JS 事件（BLIND: emitOnXxx 名/形态待核对）

- (void)onStateChange:(NSString *)state {
    [self emitOnStateChange:@{@"state": state}];
}
- (void)onProgressDeliveryId:(NSInteger)deliveryId position:(double)position duration:(double)duration buffered:(double)buffered slotId:(int64_t)slotId {
    [self emitOnProgress:@{@"deliveryId": @(deliveryId), @"position": @(position), @"duration": @(duration), @"buffered": @(buffered), @"slotId": @(slotId)}];
}
- (void)onAudioEnd:(MFSlotItem *)ended promoted:(nullable MFSlotItem *)promoted {
    NSMutableDictionary *d = [@{@"ended": MFDictFromSlot(ended)} mutableCopy];
    if (promoted) d[@"promoted"] = MFDictFromSlot(promoted);
    [self emitOnAudioEnd:d];
}

- (void)onStarted:(MFSlotItem *)item {
    [self emitOnStarted:@{@"item": MFDictFromSlot(item)}];
}
- (void)onErrorItem:(MFSlotItem *)item slot:(NSString *)slot code:(NSString *)code message:(NSString *)message {
    NSMutableDictionary *payload = [@{@"slot": slot, @"code": code, @"message": message} mutableCopy];
    if (item) payload[@"item"] = MFDictFromSlot(item);
    [self emitOnError:payload];
}
- (void)onRemoteCommand:(NSString *)command paused:(NSNumber *)paused permanent:(NSNumber *)permanent {
    NSMutableDictionary *payload = [@{@"command": command} mutableCopy];
    NSMutableDictionary *p = [NSMutableDictionary dictionary];
    if (paused) p[@"paused"] = paused;
    if (permanent) p[@"permanent"] = permanent;
    if (p.count) payload[@"payload"] = p;
    [self emitOnRemote:payload];
}
- (void)onResolveSourceRequestId:(NSInteger)requestId item:(MFSlotItem *)item {
    [self emitOnResolveSource:@{@"requestId": @(requestId), @"item": MFDictFromSlot(item)}];
}

#pragma mark - TurboModule

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
    return std::make_shared<facebook::react::NativeAudioEngineSpecJSI>(params);
}

@end
