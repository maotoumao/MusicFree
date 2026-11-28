//
//  MFAudioEngine.h
//  MusicFree —— 自研 Audio 播放引擎（iOS，对齐 Android AudioEngine.kt）
//
//  ============================ iOS Audio SDK 设计概览 ============================
//  分层：NativeAudioEngine(纯桥/marshalling/emit) → MFAudioEngine(单例引擎) →
//        MFResourceLoader(per-asset 惰性解析+抓取) / MFMediaCache(range 磁盘缓存)。
//  契约与 Android 共享同一 codegen spec（NativeAudioEngine.ts），适配层 audioEngine.ts 与 harness 复用。
//
//  关键模型：
//   - 两槽 pull：AVQueuePlayer 持 [curr,next]，slots 为单一真相源；AUTO 到底靠
//     AVPlayerItemDidPlayToEndTime，next/prev 走 JS（onRemote）。
//   - 惰性解析：所有槽 = 自定义 scheme musicfree://resolve/<cacheKey> 的 AVURLAsset + resource loader；
//     loader 首次数据请求才 emit onResolveSource、等 provideSource（25s 超时），URL 始终新鲜。
//   - progressive：loader 自抓 range 字节（headers 自管）+ MFMediaCache cache-first 落盘。
//   - hls：loader 解析后 302 重定向真清单，交 AVPlayer 原生 HLS（不缓存、headers 尽力）。
//   - remote/nowplaying/打断：MPRemoteCommandCenter + MPNowPlayingInfoCenter + AVAudioSession 通知。
//
//  与 Android 的差异（同契约、内部不同）：resolve 异步非阻塞（无 CountDownLatch）；HLS 靠重定向而非
//  ResolvingDataSource；缓存自建（无 SimpleCache 等价物）；EQ / DASH 首版 defer（EQ 返空降级、dash unsupported）。
//
//  ============================ Mac 待验清单（BLIND-WRITE）============================
//   1. project.pbxproj：把 audio/ 各文件加进 app target（本机未改，盲写手改 pbxproj 易损坏工程）。
//   2. codegen 边界：pod install 后核对 NativeAudioEngineSpec 协议名 / emitOnXxx / JSI 类 /
//      object 参数是 NSDictionary 还是生成 struct（见 NativeAudioEngine.mm 顶部 BLIND-WRITE）。
//   3. AVAssetResourceLoader byte-range 语义、HLS 重定向后 headers 是否达分片、UTType/AVError 映射 —— 真机核对。
//  =============================================================================
//
//  纯引擎：不依赖 codegen 类型，全走 Obj-C 基础类型，由 NativeAudioEngine 纯桥做 marshalling。
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// 槽的瘦身份 + 展示信息（对应 JS 的 AudioItem；完整 musicItem 留在 JS）
@interface MFSlotItem : NSObject
/// 插件来源标识，与 itemId 合成唯一身份
@property(nonatomic, copy) NSString *platform;
/// 曲目在该插件内的唯一 id（Obj-C 里 id 是保留字，故用 itemId）
@property(nonatomic, copy) NSString *itemId;
/// 本次 load 的 occurrence 号（JS 分配、每次 setAudio/setNext 换新号）；引擎不透明、只存并在事件回带；缺省 -1
@property(nonatomic, assign) int64_t slotId;
/// 字节分桶键；缺省用 platform_itemId
@property(nonatomic, copy) NSString *cacheKey;
/// StreamType：progressive(缺省) / hls / dash
@property(nonatomic, copy, nullable) NSString *streamType;
@property(nonatomic, copy, nullable) NSString *title;
@property(nonatomic, copy, nullable) NSString *artist;
@property(nonatomic, copy, nullable) NSString *album;
/// 封面 URL 或本地路径
@property(nonatomic, copy, nullable) NSString *artwork;
/// 时长（秒）
@property(nonatomic, nullable) NSNumber *duration;
@end

/// 引擎 → 纯桥 的事件回调（纯桥转成 codegen JS 事件 emitOnXxx）
@protocol MFAudioEngineListener <NSObject>
/// PlaybackState 语义字符串（idle/loading/buffering/playing/paused/stopped/error）
- (void)onStateChange:(NSString *)state;
- (void)onProgressDeliveryId:(NSInteger)deliveryId position:(double)position duration:(double)duration buffered:(double)buffered slotId:(int64_t)slotId;
/// 一首自然播完（仅 AUTO 过渡发）；ended=刚播完、promoted=引擎无缝晋升的新当前曲（队列到底为 nil）
- (void)onAudioEnd:(MFSlotItem *)ended promoted:(nullable MFSlotItem *)promoted;
/// 某媒体项首次真正出声（按 slotId 去重，resume 不发）
- (void)onStarted:(MFSlotItem *)item;
/// 某槽解析/播放失败；slot='current'|'next'，code=E_RESOLVE|E_SOURCE|E_DECODE|E_UNSUPPORTED|E_UNKNOWN
- (void)onErrorItem:(nullable MFSlotItem *)item slot:(NSString *)slot code:(NSString *)code message:(NSString *)message;
/// 远程控制（通知/锁屏/耳机）；command=next|prev|stop|duck；duck 时带 paused/permanent
- (void)onRemoteCommand:(NSString *)command paused:(nullable NSNumber *)paused permanent:(nullable NSNumber *)permanent;
/// 请 JS 解析某槽音源（惰性触发）；JS 跑 resolver 后调 provideSource 回填
- (void)onResolveSourceRequestId:(NSInteger)requestId item:(MFSlotItem *)item;
@end

/// 自研 Audio 播放引擎（进程单例）
@interface MFAudioEngine : NSObject

+ (instancetype)shared;

/// 事件回调持有者（纯桥）；弱引用避免与单例互锁
@property(nonatomic, weak, nullable) id<MFAudioEngineListener> listener;

#pragma mark - 生命周期 / 配置

/// JS setup：建 AVAudioSession、进度间隔、缓存配置
- (void)setupCacheEnabled:(BOOL)cacheEnabled
             maxCacheBytes:(long long)maxCacheBytes
    progressIntervalMs:(double)progressIntervalMs
         mixWithOthers:(BOOL)mixWithOthers;

/// JS 已消费一条进度事件；仅当前 deliveryId 生效，随后放行等待中的最新样本
- (void)acknowledgeProgressDeliveryId:(NSInteger)deliveryId;

- (NSString *)engineVersion;

#pragma mark - 两槽

/// 原子设两槽：curr + next(可空)；autoPlay 决定是否立即播
- (void)setAudio:(MFSlotItem *)item autoPlay:(BOOL)autoPlay next:(nullable MFSlotItem *)next;
/// 设/清次曲槽
- (void)setNext:(nullable MFSlotItem *)next;

#pragma mark - 播放控制

- (void)play;
- (void)pause;
- (void)stop;
- (void)seekToSeconds:(double)seconds;
- (void)setRate:(double)rate;
- (void)rateWithCompletion:(void (^)(double rate))completion;
- (void)setVolume:(double)volume;
- (void)setMixWithOthers:(BOOL)enabled;
- (void)progress:(void (^)(double position, double duration, double buffered))completion;
- (void)stateWithCompletion:(void (^)(NSString *state))completion;
- (void)updateMetaPlatform:(nullable NSString *)platform
                    itemId:(nullable NSString *)itemId
                     title:(nullable NSString *)title
                    artist:(nullable NSString *)artist
                   artwork:(nullable NSString *)artwork;
- (void)reset;

#pragma mark - 惰性解析编排（供 MFResourceLoader 回调）

/// loader 需要某 cacheKey 的真实源时调用：引擎 emit onResolveSource + 25s 超时，
/// 结果经 provideSource 回填后调 completion（url=nil 视为失败/取消）
- (void)resolveCacheKey:(NSString *)cacheKey
             completion:(void (^)(NSString *_Nullable url,
                                  NSDictionary<NSString *, NSString *> *headers))completion;

/// JS resolver 回填（纯桥转发）
- (void)provideSourceRequestId:(NSInteger)requestId
                           url:(nullable NSString *)url
                       headers:(NSDictionary<NSString *, NSString *> *)headers;

/// 当前缓存开关（供 loader 每次抓取时读最新值，支持运行时切）
- (BOOL)cacheEnabledNow;

#pragma mark - 缓存 API（ST2 落地）

- (void)cacheSize:(void (^)(long long bytes))completion;
- (void)clearCache:(void (^)(void))completion;
- (void)removeCacheKey:(NSString *)cacheKey completion:(void (^)(void))completion;

@end

NS_ASSUME_NONNULL_END
