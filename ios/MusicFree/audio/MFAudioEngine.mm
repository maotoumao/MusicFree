//
//  MFAudioEngine.mm
//  MusicFree —— 自研 Audio 播放引擎实现（iOS）
//

#import "MFAudioEngine.h"
#import "MFResourceLoader.h"
#import "MFMediaCache.h"
#import <AVFoundation/AVFoundation.h>
#import <MediaPlayer/MediaPlayer.h>
#import <UIKit/UIKit.h>
#include <limits.h>
#import <objc/runtime.h>

#pragma mark - MFSlotItem

@implementation MFSlotItem
@end

/// 在途解析句柄：记 cacheKey 供 cancelStalePending 按槽失效判定
@interface MFPendingResolve : NSObject
@property(nonatomic, copy) NSString *cacheKey;
@property(nonatomic, copy) void (^completion)(NSString *_Nullable, NSDictionary<NSString *, NSString *> *);
@end
@implementation MFPendingResolve
@end

@interface MFProgressSample : NSObject
@property(nonatomic, assign) double position;
@property(nonatomic, assign) double duration;
@property(nonatomic, assign) double buffered;
@property(nonatomic, assign) int64_t slotId;
@end
@implementation MFProgressSample
@end

#pragma mark - 常量

static NSString *const kMFEngineVersion = @"MusicFreeAudio/1.0.0";
static const double kMFResolveTimeoutSec = 25.0;
static const double kMFDefaultProgressMs = 500.0;
static const double kMFMinProgressMs = 100.0;

// 错误码（对应 JS AudioErrorCode）
static NSString *const kErrUnsupported = @"E_UNSUPPORTED";
static NSString *const kErrResolve = @"E_RESOLVE";
static NSString *const kErrSource = @"E_SOURCE";
static NSString *const kErrDecode = @"E_DECODE";
static NSString *const kErrUnknown = @"E_UNKNOWN";
static NSString *const kSlotCurrent = @"current";
static NSString *const kSlotNext = @"next";

// 关联 loader 到 AVPlayerItem（asset.resourceLoader 仅弱持有 delegate）
static const void *kMFLoaderKey = &kMFLoaderKey;

// KVO context
static void *kMFItemStatusCtx = &kMFItemStatusCtx;
static void *kMFPlayerTimeControlCtx = &kMFPlayerTimeControlCtx;
static void *kMFPlayerCurrentItemCtx = &kMFPlayerCurrentItemCtx;
// 关联 slot 到 AVPlayerItem（失败时按 slot 上报 onError）
static const void *kMFSlotKey = &kMFSlotKey;

#pragma mark - MFAudioEngine

@interface MFAudioEngine ()
@property(nonatomic, strong) AVQueuePlayer *player;
@property(nonatomic, strong) dispatch_queue_t loaderQueue;
@property(nonatomic, copy) NSArray<MFSlotItem *> *slots;  // index0=curr, index1=next（单一真相源）

@property(nonatomic, assign) BOOL stopped;   // stop() 与到底进 idle，用它区分 idle(未加载) 与 stopped
@property(nonatomic, assign) BOOL errored;
@property(nonatomic, assign) BOOL loading;   // 当前曲首次 ready 前为 YES
@property(nonatomic, copy, nullable) NSString *lastState;

@property(nonatomic, assign) double progressIntervalMs;
@property(nonatomic, assign) double desiredRate;  // 播放倍率（AVPlayer.rate=0 表暂停，故单独存）
@property(nonatomic, strong, nullable) id timeObserver;
@property(nonatomic, strong) NSMutableSet<AVPlayerItem *> *observedItems;  // 挂了 status/结束通知的 item（curr+next）

// 惰性解析在途表：requestId → MFPendingResolve
@property(nonatomic, strong) NSMutableDictionary<NSNumber *, MFPendingResolve *> *pending;
@property(nonatomic, assign) NSInteger requestSeq;

@property(atomic, assign) BOOL cacheEnabled;  // 跨线程：setup(主) 写 / loader 队列读 → atomic
@property(nonatomic, strong, nullable) MFMediaCache *cache;
@property(nonatomic, assign) BOOL rebuilding;               // setAudio 重建队列中：抑制中间态 emit
@property(nonatomic, assign) BOOL interruptedWhilePlaying;  // 打断开始时是否在播：决定 ended 是否恢复
@property(nonatomic, assign) int64_t startedSlotId;         // 已发过 onStarted 的 slotId（去重：resume/同 load 不重发）
@property(nonatomic, assign) NSInteger progressDeliverySeq;
@property(nonatomic, assign) NSInteger progressInFlightId;
@property(nonatomic, strong, nullable) MFProgressSample *pendingProgress;
@end

@implementation MFAudioEngine

+ (instancetype)shared {
    static MFAudioEngine *inst;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ inst = [[MFAudioEngine alloc] init]; });
    return inst;
}

- (instancetype)init {
    if (self = [super init]) {
        _loaderQueue = dispatch_queue_create("fun.upup.musicfree.audio.loader", DISPATCH_QUEUE_SERIAL);
        _slots = @[];
        _pending = [NSMutableDictionary dictionary];
        _progressIntervalMs = kMFDefaultProgressMs;
        _desiredRate = 1.0;
        _observedItems = [NSMutableSet set];
        _requestSeq = 0;
        _startedSlotId = INT64_MIN;
    }
    return self;
}

- (NSString *)engineVersion { return kMFEngineVersion; }

- (BOOL)cacheEnabledNow { return self.cacheEnabled; }  // cacheEnabled 为 atomic property，跨线程读安全

- (void)setListener:(id<MFAudioEngineListener>)listener {
    [self runOnMain:^{
        self->_listener = listener;
        self.progressInFlightId = 0;
        self.pendingProgress = nil;
    }];
}

/// 所有状态操作串到主线程（对齐 Android runOnMain：AVFoundation KVO/observer 也在主线程回）
- (void)runOnMain:(dispatch_block_t)block {
    if ([NSThread isMainThread]) block();
    else dispatch_async(dispatch_get_main_queue(), block);
}

#pragma mark - setup

- (void)setupCacheEnabled:(BOOL)cacheEnabled
             maxCacheBytes:(long long)maxCacheBytes
        progressIntervalMs:(double)progressIntervalMs
             mixWithOthers:(BOOL)mixWithOthers {
    [self runOnMain:^{
        self.cacheEnabled = cacheEnabled;
        self.progressIntervalMs = MAX(progressIntervalMs, kMFMinProgressMs);
        // MFMediaCache 进程内单建：maxBytes>0 才建（仅 progressive 落盘）
        if (!self.cache && maxCacheBytes > 0) self.cache = [[MFMediaCache alloc] initWithMaxBytes:maxCacheBytes];

        // AVAudioSession：playback 类别，支持后台播放（Info.plist 需 UIBackgroundModes=audio）
        AVAudioSession *session = [AVAudioSession sharedInstance];
        NSError *catErr = nil, *actErr = nil;
        AVAudioSessionCategoryOptions options = mixWithOthers ? AVAudioSessionCategoryOptionMixWithOthers : 0;
        [session setCategory:AVAudioSessionCategoryPlayback mode:AVAudioSessionModeDefault options:options error:&catErr];
        [session setActive:YES error:&actErr];
        if (catErr || actErr) {
            NSError *e = catErr ?: actErr;
            [self.listener onErrorItem:nil slot:kSlotCurrent code:kErrUnknown
                               message:[NSString stringWithFormat:@"audio session: %@", e.localizedDescription]];
        }
        // BLIND-WRITE: 打断/路由通知与 remote command center 在 ST3 接入

        if (!self.player) {
            self.player = [[AVQueuePlayer alloc] init];
            // resource-loader 驱动的 item 建议关掉自动等待（见 CachingPlayerItem/Apple 文档），改善起播
            self.player.automaticallyWaitsToMinimizeStalling = NO;
            [self.player addObserver:self forKeyPath:@"timeControlStatus" options:0 context:kMFPlayerTimeControlCtx];
            [self.player addObserver:self forKeyPath:@"currentItem" options:0 context:kMFPlayerCurrentItemCtx];
            [self setupRemoteCommands];
            [self setupSessionNotifications];
        }
        [self installTimeObserver];  // 每次 setup 重装：progressIntervalMs 变化生效
    }];
}

- (void)acknowledgeProgressDeliveryId:(NSInteger)deliveryId {
    [self runOnMain:^{
        if (self.progressInFlightId != deliveryId) return;
        self.progressInFlightId = 0;
        MFProgressSample *latest = self.pendingProgress;
        self.pendingProgress = nil;
        if (latest) [self sendProgressSample:latest];
    }];
}

- (void)installTimeObserver {
    if (self.timeObserver) [self.player removeTimeObserver:self.timeObserver];
    CMTime interval = CMTimeMakeWithSeconds(self.progressIntervalMs / 1000.0, NSEC_PER_SEC);
    __weak typeof(self) weakSelf = self;
    self.timeObserver = [self.player addPeriodicTimeObserverForInterval:interval
                                                                  queue:dispatch_get_main_queue()
                                                             usingBlock:^(CMTime time) {
        [weakSelf emitProgress];
    }];
}

#pragma mark - 两槽

/// 支持的 streamType：progressive/nil + hls（loader 重定向交原生）；dash 恒不支持（iOS 无原生 DASH）
- (BOOL)isSupportedStreamType:(nullable NSString *)streamType {
    if (streamType == nil || streamType.length == 0) return YES;
    if ([streamType isEqualToString:@"progressive"]) return YES;
    if ([streamType isEqualToString:@"hls"]) return YES;
    return NO;  // dash → 不支持
}

/// 占位 URL：musicfree://resolve/<cacheKey>（自定义 scheme 强制走 resource loader）
- (nullable AVPlayerItem *)buildPlayerItemForSlot:(MFSlotItem *)slot {
    if (![self isSupportedStreamType:slot.streamType]) return nil;
    NSString *encoded = [slot.cacheKey stringByAddingPercentEncodingWithAllowedCharacters:
                         [NSCharacterSet URLPathAllowedCharacterSet]];
    NSURL *placeholder = [NSURL URLWithString:[MFPlaceholderPrefix stringByAppendingString:encoded ?: @""]];
    AVURLAsset *asset = [AVURLAsset URLAssetWithURL:placeholder options:nil];
    MFResourceLoader *loader = [[MFResourceLoader alloc] initWithCacheKey:slot.cacheKey
                                                              streamType:slot.streamType
                                                                  engine:self
                                                                   queue:self.loaderQueue
                                                                   cache:self.cache];
    [asset.resourceLoader setDelegate:loader queue:self.loaderQueue];
    AVPlayerItem *item = [AVPlayerItem playerItemWithAsset:asset];
    // asset.resourceLoader 弱持有 delegate → 关联 loader 到 item 一起 retain
    objc_setAssociatedObject(item, kMFLoaderKey, loader, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    return item;
}

- (void)setAudio:(MFSlotItem *)item autoPlay:(BOOL)autoPlay next:(nullable MFSlotItem *)next {
    [self runOnMain:^{
        self.stopped = NO;
        self.errored = NO;
        // 首版不做「命中已预取 slot1 快路径」（D5）：一律整体重建两槽

        AVPlayerItem *currItem = [self buildPlayerItemForSlot:item];
        if (!currItem) {
            self.loading = NO;
            self.errored = YES;
            self.slots = @[];
            [self teardownAllItems];
            [self cancelStalePending];
            [self.listener onErrorItem:item slot:kSlotCurrent code:kErrUnsupported
                               message:[NSString stringWithFormat:@"unsupported streamType: %@", item.streamType]];
            [self emitState];
            return;
        }
        self.loading = YES;

        MFSlotItem *nextSlot = nil;
        AVPlayerItem *nextItem = nil;
        if (next) {
            nextItem = [self buildPlayerItemForSlot:next];
            if (nextItem) {
                nextSlot = next;
            } else {
                [self.listener onErrorItem:next slot:kSlotNext code:kErrUnsupported
                                   message:[NSString stringWithFormat:@"unsupported streamType: %@", next.streamType]];
            }
        }

        // 先更新槽（单一真相源）；先 teardown(invalidate 旧 loader + 拆观察) 再 cancelStalePending，
        // 保 stale completion 到达 loader queue 时 invalidated 已置位 → no-op
        self.slots = nextSlot ? @[item, nextSlot] : @[item];

        self.rebuilding = YES;
        [self teardownAllItems];
        [self cancelStalePending];
        [self.player insertItem:currItem afterItem:nil];
        [self attachObserversForItem:currItem slot:item];
        if (nextItem) {
            [self.player insertItem:nextItem afterItem:currItem];
            [self attachObserversForItem:nextItem slot:nextSlot];
        }
        self.rebuilding = NO;

        if (autoPlay) [self.player playImmediatelyAtRate:(float)self.desiredRate];
        [self emitState];
        [self updateNowPlayingMeta];
    }];
}

- (void)setNext:(nullable MFSlotItem *)next {
    [self runOnMain:^{
        MFSlotItem *curr = self.slots.firstObject;
        if (!curr) return;  // 无 curr 不预取

        // 清掉现有 next（保留 currentItem 之后的项）：先拆观察+invalidate loader 再移除
        AVPlayerItem *currentPlayerItem = self.player.currentItem;
        for (AVPlayerItem *it in [self.player.items copy]) {
            if (it != currentPlayerItem) { [self detachObserversForItem:it]; [self.player removeItem:it]; }
        }

        AVPlayerItem *nextItem = next ? [self buildPlayerItemForSlot:next] : nil;
        if (next && !nextItem) {
            self.slots = @[curr];
            [self cancelStalePending];
            [self.listener onErrorItem:next slot:kSlotNext code:kErrUnsupported
                               message:[NSString stringWithFormat:@"unsupported streamType: %@", next.streamType]];
            return;
        }
        self.slots = nextItem ? @[curr, next] : @[curr];
        [self cancelStalePending];
        if (nextItem) {
            [self.player insertItem:nextItem afterItem:currentPlayerItem];
            [self attachObserversForItem:nextItem slot:next];
        }
    }];
}

#pragma mark - 播放控制

- (void)play {
    [self runOnMain:^{
        self.stopped = NO;
        self.errored = NO;
        [self.player playImmediatelyAtRate:(float)self.desiredRate];
        [self emitState];
    }];
}

- (void)pause {
    [self runOnMain:^{ [self.player pause]; [self emitState]; }];
}

- (void)stop {
    [self runOnMain:^{
        self.stopped = YES;
        self.errored = NO;
        self.loading = NO;
        [self.player pause];
        [self.player seekToTime:kCMTimeZero];
        [self emitState];
    }];
}

- (void)seekToSeconds:(double)seconds {
    [self runOnMain:^{
        CMTime t = CMTimeMakeWithSeconds(MAX(seconds, 0), NSEC_PER_SEC);
        [self.player seekToTime:t toleranceBefore:kCMTimeZero toleranceAfter:kCMTimeZero
             completionHandler:^(BOOL finished) {
            if (finished) [self runOnMain:^{ [self updateNowPlayingPlayback]; }];  // seek 后刷锁屏进度
        }];
    }];
}

- (void)setRate:(double)rate {
    [self runOnMain:^{
        if (rate <= 0) return;  // 倍率须 > 0；暂停走 pause
        self.desiredRate = rate;
        // 仅在播放中即时应用；暂停时只记录，play() 时按 desiredRate 恢复
        if (self.player.timeControlStatus == AVPlayerTimeControlStatusPlaying) self.player.rate = (float)rate;
    }];
}

- (void)rateWithCompletion:(void (^)(double))completion {
    [self runOnMain:^{ completion(self.desiredRate); }];
}

- (void)setVolume:(double)volume {
    [self runOnMain:^{ self.player.volume = (float)MAX(0, MIN(1, volume)); }];
}

- (void)setMixWithOthers:(BOOL)enabled {
    [self runOnMain:^{
        AVAudioSession *session = [AVAudioSession sharedInstance];
        AVAudioSessionCategoryOptions options = enabled ? AVAudioSessionCategoryOptionMixWithOthers : 0;
        NSError *error = nil;
        [session setCategory:AVAudioSessionCategoryPlayback mode:AVAudioSessionModeDefault options:options error:&error];
        if (error) {
            [self.listener onErrorItem:nil slot:kSlotCurrent code:kErrUnknown
                               message:[NSString stringWithFormat:@"audio session: %@", error.localizedDescription]];
        }
    }];
}

- (void)progress:(void (^)(double, double, double))completion {
    [self runOnMain:^{
        AVPlayerItem *it = self.player.currentItem;
        if (!it) { completion(0, 0, 0); return; }
        double pos = self.stopped ? 0 : CMTimeGetSeconds(it.currentTime);  // stopped 归零（对齐契约）
        double dur = CMTimeGetSeconds(it.duration);
        double buf = [self bufferedSecondsOf:it];
        completion(isfinite(pos) ? pos : 0, isfinite(dur) ? dur : 0, buf);
    }];
}

- (double)bufferedSecondsOf:(AVPlayerItem *)item {
    double buffered = 0;
    for (NSValue *v in item.loadedTimeRanges) {
        CMTimeRange r = [v CMTimeRangeValue];
        double end = CMTimeGetSeconds(r.start) + CMTimeGetSeconds(r.duration);
        if (end > buffered) buffered = end;
    }
    return isfinite(buffered) ? buffered : 0;
}

- (void)stateWithCompletion:(void (^)(NSString *))completion {
    [self runOnMain:^{ completion([self computeState]); }];
}

- (void)updateMetaPlatform:(nullable NSString *)platform
                    itemId:(nullable NSString *)itemId
                     title:(nullable NSString *)title
                    artist:(nullable NSString *)artist
                   artwork:(nullable NSString *)artwork {
    [self runOnMain:^{
        // 身份校验：与当前曲 platform+itemId 不一致(已切走)则丢弃（对齐 Android B）
        MFSlotItem *curr = self.slots.firstObject;
        if (!curr) return;
        if (![curr.platform isEqualToString:platform] || ![curr.itemId isEqualToString:itemId]) return;
        if (title) curr.title = title;
        if (artist) curr.artist = artist;
        if (artwork) curr.artwork = artwork;
        [self updateNowPlayingMeta];  // 刷新锁屏/控制中心展示
    }];
}

- (void)reset {
    [self runOnMain:^{
        self.stopped = NO;
        self.errored = NO;
        self.loading = NO;
        self.slots = @[];
        [self teardownAllItems];
        [self cancelStalePending];
        [MPNowPlayingInfoCenter defaultCenter].nowPlayingInfo = nil;
        [self emitState];
    }];
}

#pragma mark - 惰性解析编排

- (void)resolveCacheKey:(NSString *)cacheKey
             completion:(void (^)(NSString *_Nullable, NSDictionary<NSString *, NSString *> *))completion {
    [self runOnMain:^{
        // 取当前槽里同 cacheKey 的 item；不在槽=作废
        MFSlotItem *item = nil;
        for (MFSlotItem *s in self.slots) {
            if ([s.cacheKey isEqualToString:cacheKey]) { item = s; break; }
        }
        if (!item || !self.listener) { completion(nil, @{}); return; }

        NSInteger requestId = ++self.requestSeq;
        MFPendingResolve *p = [MFPendingResolve new];
        p.cacheKey = cacheKey;
        p.completion = completion;
        self.pending[@(requestId)] = p;
        [self.listener onResolveSourceRequestId:requestId item:item];

        // 25s 超时兜底
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(kMFResolveTimeoutSec * NSEC_PER_SEC)),
                       dispatch_get_main_queue(), ^{
            MFPendingResolve *pend = self.pending[@(requestId)];
            if (pend) {
                [self.pending removeObjectForKey:@(requestId)];
                pend.completion(nil, @{});  // 归 E_RESOLVE，由 loader 失败上报
            }
        });
    }];
}

- (void)provideSourceRequestId:(NSInteger)requestId
                           url:(nullable NSString *)url
                       headers:(NSDictionary<NSString *, NSString *> *)headers {
    [self runOnMain:^{
        MFPendingResolve *pend = self.pending[@(requestId)];
        if (!pend) return;  // 已超时/已兑现 → 迟到的回填 no-op
        [self.pending removeObjectForKey:@(requestId)];
        pend.completion(url, headers ?: @{});
    }];
}

/// 唤醒并移除「cacheKey 已不在任何槽」的在途解析（换歌/清空后）：回填 null 令 loader 失败/取消
- (void)cancelStalePending {
    NSSet *live = [NSSet setWithArray:[self.slots valueForKey:@"cacheKey"]];
    for (NSNumber *rid in [self.pending allKeys]) {
        MFPendingResolve *p = self.pending[rid];
        if (![live containsObject:p.cacheKey]) {
            [self.pending removeObjectForKey:rid];
            p.completion(nil, @{});
        }
    }
}

#pragma mark - 缓存 API（ST2 落地）

- (void)cacheSize:(void (^)(long long))completion {
    [self runOnMain:^{
        MFMediaCache *cache = self.cache;
        // totalBytes 内部 dispatch_sync 到 cache queue，放 utility 线程避免阻塞主线程
        dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
            completion(cache ? [cache totalBytes] : 0);
        });
    }];
}
- (void)clearCache:(void (^)(void))completion {
    [self runOnMain:^{
        if (self.cache) [self.cache clearWithCompletion:^{ completion(); }];
        else completion();
    }];
}
- (void)removeCacheKey:(NSString *)cacheKey completion:(void (^)(void))completion {
    [self runOnMain:^{
        if (self.cache) [self.cache removeKey:cacheKey completion:^{ completion(); }];
        else completion();
    }];
}

#pragma mark - 观察与状态

- (void)attachObserversForItem:(AVPlayerItem *)item slot:(MFSlotItem *)slot {
    objc_setAssociatedObject(item, kMFSlotKey, slot, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    if ([self.observedItems containsObject:item]) return;
    [item addObserver:self forKeyPath:@"status" options:0 context:kMFItemStatusCtx];
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(itemDidPlayToEnd:)
                                                 name:AVPlayerItemDidPlayToEndTimeNotification object:item];
    [self.observedItems addObject:item];
}

- (void)detachObserversForItem:(AVPlayerItem *)item {
    if (![self.observedItems containsObject:item]) return;
    @try {
        [item removeObserver:self forKeyPath:@"status" context:kMFItemStatusCtx];
        [[NSNotificationCenter defaultCenter] removeObserver:self
                                                        name:AVPlayerItemDidPlayToEndTimeNotification object:item];
    } @catch (__unused NSException *e) {}
    [self.observedItems removeObject:item];
    MFResourceLoader *loader = objc_getAssociatedObject(item, kMFLoaderKey);
    [loader invalidate];  // 断开 URLSession 自环、停多余下载
}

/// 清空 player 全部 item：先拆每项观察 + invalidate loader，再 removeAllItems
- (void)teardownAllItems {
    for (AVPlayerItem *it in [self.observedItems copy]) [self detachObserversForItem:it];
    [self.player removeAllItems];
}

- (void)observeValueForKeyPath:(NSString *)keyPath ofObject:(id)object
                        change:(NSDictionary *)change context:(void *)context {
    if (context == kMFPlayerCurrentItemCtx) {
        [self runOnMain:^{
            // 切到新 current：立即按其 status 复位 loading/error（补发已就绪/已失败）
            AVPlayerItem *cur = self.player.currentItem;
            if (cur.status == AVPlayerItemStatusReadyToPlay) self.loading = NO;
            else if (cur.status == AVPlayerItemStatusFailed) { self.errored = YES; self.loading = NO; }
            [self emitState];
            [self maybeEmitStarted];  // 无缝晋升后 currentItem 确实已切换且在播 → 补发新曲 started
        }];
        return;
    }
    if (context == kMFItemStatusCtx) {
        AVPlayerItem *it = (AVPlayerItem *)object;  // 可能是 curr 或 next 槽
        [self runOnMain:^{
            if (it.status == AVPlayerItemStatusFailed) {
                BOOL isCurrent = (it == self.player.currentItem);
                if (isCurrent) { self.errored = YES; self.loading = NO; }
                MFSlotItem *slot = objc_getAssociatedObject(it, kMFSlotKey);
                [self.listener onErrorItem:slot slot:(isCurrent ? kSlotCurrent : kSlotNext)
                                      code:[self bucketErrorCode:it.error]
                                   message:(it.error.localizedDescription ?: @"playback error")];
            } else if (it.status == AVPlayerItemStatusReadyToPlay && it == self.player.currentItem) {
                self.loading = NO;
            }
            [self emitState];
        }];
        return;
    }
    if (context == kMFPlayerTimeControlCtx) {
        [self runOnMain:^{ [self emitState]; [self maybeEmitStarted]; }];
        return;
    }
    [super observeValueForKeyPath:keyPath ofObject:object change:change context:context];
}

/// 自然播完（AUTO）：拆该项观察、curr 前移、发 onAudioEnd；队列到底置 stopped
- (void)itemDidPlayToEnd:(NSNotification *)note {
    AVPlayerItem *ended = note.object;
    // 结束项自身关联的槽（绑定实际 AVPlayerItem，非 live slots）：防结束通知异步与在途 setAudio 竞态错报
    MFSlotItem *endedSlot = objc_getAssociatedObject(ended, kMFSlotKey) ?: self.slots.firstObject;
    [self runOnMain:^{
        [self detachObserversForItem:ended];  // AVQueuePlayer 已自动出队该项
        // 迟到通知防护：若届时 SoT 头部已不是这个结束项（主线程已处理 setAudio），忽略，交 currentItem KVO 结算
        if (endedSlot && self.slots.firstObject != endedSlot) { [self emitState]; return; }
        if (self.slots.count > 0) self.slots = [self.slots subarrayWithRange:NSMakeRange(1, self.slots.count - 1)];
        // 引擎无缝晋升的新当前曲：currentItem 可能尚未推进（通知与晋升顺序不保证）→ 仍是 ended 时用前移后的 slots 头部，避免 promoted==ended
        MFSlotItem *promotedSlot = (self.player.currentItem && self.player.currentItem != ended)
            ? (objc_getAssociatedObject(self.player.currentItem, kMFSlotKey) ?: self.slots.firstObject)
            : self.slots.firstObject;
        if (self.slots.count == 0) { self.stopped = YES; self.loading = NO; }  // 队列到底=stopped（对齐契约）
        else self.loading = (self.player.currentItem.status != AVPlayerItemStatusReadyToPlay);
        if (endedSlot) [self.listener onAudioEnd:endedSlot promoted:promotedSlot];
        // 契约：失败的预取 next 晋升为 current 后必须补发 onError(current)。预取阶段已按 next 上报 status→Failed
        // 状态不会再变化，因此在 onAudioEnd 后补发，确保 JS 先完成晋升，再进入统一的 current 恢复流程
        // TODO iOS bring-up：通知早于晋升、currentItem 尚未指向失败项时，需真机确认此处能否取得 Failed 状态
        AVPlayerItem *promotedItem = (self.player.currentItem && self.player.currentItem != ended)
            ? self.player.currentItem : nil;
        if (promotedSlot && promotedItem && promotedItem.status == AVPlayerItemStatusFailed) {
            [self.listener onErrorItem:promotedSlot slot:kSlotCurrent
                                  code:[self bucketErrorCode:promotedItem.error]
                               message:(promotedItem.error.localizedDescription ?: @"playback error")];
        }
        [self maybeEmitStarted];  // 无缝续播：新 current 已在出声（timeControl 无新边沿），补发 started
        [self emitState];
        [self updateNowPlayingMeta];
    }];
}

/// 当前槽首次真正出声时发一次 onStarted（按 slotId 去重：resume/同 load 不重发）
- (void)maybeEmitStarted {
    if (self.player.timeControlStatus != AVPlayerTimeControlStatusPlaying) return;
    MFSlotItem *cur = objc_getAssociatedObject(self.player.currentItem, kMFSlotKey) ?: self.slots.firstObject;
    if (!cur || cur.slotId == self.startedSlotId) return;
    self.startedSlotId = cur.slotId;
    [self.listener onStarted:cur];
}

/// AVError → 稳定错误码
- (NSString *)bucketErrorCode:(nullable NSError *)err {
    if (!err) return kErrUnknown;
    // resolver 返回 null/超时 → MFResourceLoader 以此 domain+code=-1 失败该项 → 归 E_RESOLVE
    if ([err.domain isEqualToString:@"fun.upup.musicfree.audio"] && err.code == -1) return kErrResolve;
    if ([err.domain isEqualToString:NSURLErrorDomain]) return kErrSource;
    // BLIND-WRITE: AVFoundationErrorDomain 各 code（解码 vs IO）真机核对细化
    if ([err.domain isEqualToString:AVFoundationErrorDomain]) {
        if (err.code == AVErrorFileFormatNotRecognized || err.code == AVErrorContentIsNotAuthorized) return kErrUnsupported;
        if (err.code == AVErrorDecodeFailed) return kErrDecode;
        return kErrSource;
    }
    return kErrUnknown;
}

- (NSString *)computeState {
    if (self.errored) return @"error";
    AVPlayerItem *it = self.player.currentItem;
    if (!it) return self.stopped ? @"stopped" : @"idle";
    if (it.status == AVPlayerItemStatusFailed) return @"error";
    if (self.stopped) return @"stopped";
    if (self.loading) return @"loading";
    if (self.player.timeControlStatus == AVPlayerTimeControlStatusPlaying) return @"playing";
    if (self.player.timeControlStatus == AVPlayerTimeControlStatusWaitingToPlayAtSpecifiedRate) return @"buffering";
    return @"paused";
}

- (void)emitState {
    if (self.rebuilding) return;  // 重建队列中间态不外发
    NSString *s = [self computeState];
    if ([s isEqualToString:self.lastState]) return;
    self.lastState = s;
    [self.listener onStateChange:s];
    [self updateNowPlayingPlayback];  // 状态变→刷新锁屏 elapsed/rate
}

- (void)emitProgress {
    AVPlayerItem *it = self.player.currentItem;
    if (!it) return;
    // 原子快照：进度值与 slotId 均从同一 currentItem 采样；无关联 slot 或 -1 哨兵时不发送，不使用旧样本回填 live 槽身份
    MFSlotItem *slot = objc_getAssociatedObject(it, kMFSlotKey);
    if (!slot || slot.slotId <= 0) return;
    double pos = CMTimeGetSeconds(it.currentTime);
    double dur = CMTimeGetSeconds(it.duration);
    double buf = [self bufferedSecondsOf:it];
    MFProgressSample *sample = [MFProgressSample new];
    sample.position = isfinite(pos) ? pos : 0;
    sample.duration = isfinite(dur) ? dur : 0;
    sample.buffered = buf;
    sample.slotId = slot.slotId;
    if (self.progressInFlightId != 0) {
        self.pendingProgress = sample;
        return;
    }
    [self sendProgressSample:sample];
}

- (void)sendProgressSample:(MFProgressSample *)sample {
    id<MFAudioEngineListener> currentListener = self.listener;
    if (!currentListener) {
        self.progressInFlightId = 0;
        self.pendingProgress = nil;
        return;
    }
    self.progressDeliverySeq = self.progressDeliverySeq == INT_MAX ? 1 : self.progressDeliverySeq + 1;
    self.progressInFlightId = self.progressDeliverySeq;
    [currentListener onProgressDeliveryId:self.progressDeliverySeq
                                 position:sample.position
                                 duration:sample.duration
                                 buffered:sample.buffered
                                   slotId:sample.slotId];
}

#pragma mark - Remote / NowPlaying / 打断（ST3）

- (void)setupRemoteCommands {
    MPRemoteCommandCenter *cc = [MPRemoteCommandCenter sharedCommandCenter];
    __weak typeof(self) ws = self;
    cc.playCommand.enabled = YES;
    [cc.playCommand addTargetWithHandler:^MPRemoteCommandHandlerStatus(MPRemoteCommandEvent *e) {
        [ws play]; return MPRemoteCommandHandlerStatusSuccess;
    }];
    cc.pauseCommand.enabled = YES;
    [cc.pauseCommand addTargetWithHandler:^MPRemoteCommandHandlerStatus(MPRemoteCommandEvent *e) {
        [ws pause]; return MPRemoteCommandHandlerStatusSuccess;
    }];
    cc.togglePlayPauseCommand.enabled = YES;
    [cc.togglePlayPauseCommand addTargetWithHandler:^MPRemoteCommandHandlerStatus(MPRemoteCommandEvent *e) {
        [ws togglePlayPause]; return MPRemoteCommandHandlerStatusSuccess;
    }];
    // next/prev/stop 走 JS（对齐 Android：JS 持权威队列）；都经 runOnMain 发事件
    cc.nextTrackCommand.enabled = YES;
    [cc.nextTrackCommand addTargetWithHandler:^MPRemoteCommandHandlerStatus(MPRemoteCommandEvent *e) {
        [ws emitRemote:@"next"]; return MPRemoteCommandHandlerStatusSuccess;
    }];
    cc.previousTrackCommand.enabled = YES;
    [cc.previousTrackCommand addTargetWithHandler:^MPRemoteCommandHandlerStatus(MPRemoteCommandEvent *e) {
        [ws emitRemote:@"prev"]; return MPRemoteCommandHandlerStatusSuccess;
    }];
    cc.stopCommand.enabled = YES;
    [cc.stopCommand addTargetWithHandler:^MPRemoteCommandHandlerStatus(MPRemoteCommandEvent *e) {
        [ws emitRemote:@"stop"]; return MPRemoteCommandHandlerStatusSuccess;
    }];
    cc.changePlaybackPositionCommand.enabled = YES;
    [cc.changePlaybackPositionCommand addTargetWithHandler:^MPRemoteCommandHandlerStatus(MPRemoteCommandEvent *e) {
        [ws seekToSeconds:((MPChangePlaybackPositionCommandEvent *)e).positionTime];
        return MPRemoteCommandHandlerStatusSuccess;
    }];
}

- (void)togglePlayPause {
    [self runOnMain:^{
        if (self.player.timeControlStatus == AVPlayerTimeControlStatusPaused) [self play];
        else [self pause];
    }];
}

/// 远程命令统一经主线程发事件（MPRemoteCommand handler 不保证在主线程）
- (void)emitRemote:(NSString *)command {
    [self runOnMain:^{ [self.listener onRemoteCommand:command paused:nil permanent:nil]; }];
}

- (void)updateNowPlayingMeta {
    MFSlotItem *cur = self.slots.firstObject;
    if (!cur) { [MPNowPlayingInfoCenter defaultCenter].nowPlayingInfo = nil; return; }
    NSMutableDictionary *info = [NSMutableDictionary dictionary];
    if (cur.title) info[MPMediaItemPropertyTitle] = cur.title;
    if (cur.artist) info[MPMediaItemPropertyArtist] = cur.artist;
    if (cur.album) info[MPMediaItemPropertyAlbumTitle] = cur.album;
    AVPlayerItem *it = self.player.currentItem;
    double dur = it ? CMTimeGetSeconds(it.duration) : 0;
    if (cur.duration) info[MPMediaItemPropertyPlaybackDuration] = cur.duration;
    else if (isfinite(dur) && dur > 0) info[MPMediaItemPropertyPlaybackDuration] = @(dur);
    double pos = it ? CMTimeGetSeconds(it.currentTime) : 0;
    info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = @(isfinite(pos) ? pos : 0);
    info[MPNowPlayingInfoPropertyPlaybackRate] = @(self.player.rate);
    [MPNowPlayingInfoCenter defaultCenter].nowPlayingInfo = info;
    [self loadArtworkForSlot:cur];  // 封面异步补
}

/// 状态变化时只刷 elapsed/rate（保留 meta/封面），避免每次重建整份
- (void)updateNowPlayingPlayback {
    NSMutableDictionary *info = [[MPNowPlayingInfoCenter defaultCenter].nowPlayingInfo mutableCopy];
    if (!info) return;
    AVPlayerItem *it = self.player.currentItem;
    double pos = (it && !self.stopped) ? CMTimeGetSeconds(it.currentTime) : 0;
    info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = @(isfinite(pos) ? pos : 0);
    info[MPNowPlayingInfoPropertyPlaybackRate] = @(self.player.rate);
    [MPNowPlayingInfoCenter defaultCenter].nowPlayingInfo = info;
}

- (void)loadArtworkForSlot:(MFSlotItem *)slot {
    NSString *artwork = slot.artwork;
    NSURL *url = [self urlFromString:artwork];
    if (!url) return;
    NSString *cacheKey = slot.cacheKey;
    __weak typeof(self) ws = self;
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
        NSData *data = [NSData dataWithContentsOfURL:url];  // BLIND-WRITE: 后续可接图片缓存
        UIImage *img = data ? [UIImage imageWithData:data] : nil;
        if (!img) return;
        [ws runOnMain:^{
            MFSlotItem *cur = ws.slots.firstObject;
            // 当前曲 + 封面地址都未变才贴（防切歌错位 + updateMeta 改封面竞态）
            if (![cur.cacheKey isEqualToString:cacheKey] || ![cur.artwork isEqualToString:artwork]) return;
            NSMutableDictionary *info = [[MPNowPlayingInfoCenter defaultCenter].nowPlayingInfo mutableCopy] ?: [NSMutableDictionary dictionary];
            info[MPMediaItemPropertyArtwork] = [[MPMediaItemArtwork alloc] initWithBoundsSize:img.size
                                                                              requestHandler:^UIImage *(CGSize size) { return img; }];
            [MPNowPlayingInfoCenter defaultCenter].nowPlayingInfo = info;
        }];
    });
}

/// artwork 字符串 → URL：有 scheme 走 URLWithString(http/https/file)，无 scheme 视本地路径(容忍空格/中文)
- (nullable NSURL *)urlFromString:(nullable NSString *)s {
    if (!s.length) return nil;
    NSURL *u = [NSURL URLWithString:s];
    if (u.scheme.length) return u;
    return [NSURL fileURLWithPath:s];
}

- (void)setupSessionNotifications {
    NSNotificationCenter *nc = [NSNotificationCenter defaultCenter];
    [nc addObserver:self selector:@selector(handleInterruption:)
               name:AVAudioSessionInterruptionNotification object:nil];
    [nc addObserver:self selector:@selector(handleRouteChange:)
               name:AVAudioSessionRouteChangeNotification object:nil];
}

/// 打断（来电/其他 app 抢焦点）：began→暂停（对齐 Android：焦点内部处理、不发 duck 事件，JS 只认 onStateChange）；ended→按 shouldResume 恢复
- (void)handleInterruption:(NSNotification *)note {
    NSInteger type = [note.userInfo[AVAudioSessionInterruptionTypeKey] integerValue];
    [self runOnMain:^{
        if (type == AVAudioSessionInterruptionTypeBegan) {
            self.interruptedWhilePlaying = (self.player.timeControlStatus == AVPlayerTimeControlStatusPlaying || self.player.rate > 0);
            [self.player pause];
            [self emitState];
        } else if (type == AVAudioSessionInterruptionTypeEnded) {
            NSInteger opts = [note.userInfo[AVAudioSessionInterruptionOptionKey] integerValue];
            if (self.interruptedWhilePlaying && (opts & AVAudioSessionInterruptionOptionShouldResume)) {
                [[AVAudioSession sharedInstance] setActive:YES error:nil];
                [self play];
            }
            self.interruptedWhilePlaying = NO;  // 打断前非播放态则不恢复
        }
    }];
}

/// 路由变化：旧设备不可用（拔耳机/断蓝牙）→ 暂停，防外放
- (void)handleRouteChange:(NSNotification *)note {
    NSInteger reason = [note.userInfo[AVAudioSessionRouteChangeReasonKey] integerValue];
    if (reason != AVAudioSessionRouteChangeReasonOldDeviceUnavailable) return;
    [self runOnMain:^{ [self.player pause]; [self emitState]; }];
}

@end
