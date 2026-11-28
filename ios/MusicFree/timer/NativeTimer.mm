//
//  NativeTimer.mm
//  MusicFree —— Timer TurboModule 纯桥实现（New Architecture）
//
//  串行 GCD queue 上 dispatch_after 计时；每个 id 存一个 generation token，到点比对 token 仍有效才
//  emit（clear 移除 key、同 id 重排换新 token → 旧回调 no-op）。__weak self 保证模块销毁后回调自动 no-op。
//  语义与 Android HandlerThread 版对齐：进程存活期间触发，挂起顺延，不穿透进程死亡。
//  注：dispatch_after 无提前出队 API，clear/重排后的旧 block 会滞留到原截止时间才 no-op（非泄漏，
//  仅延迟释放两个 NSNumber）；本 app timer 少且短，影响可忽略。要严格提前释放需改 dispatch_source_t。
//  BLIND-WRITE：NativeTimerSpec / NativeTimerSpecJSI 名、emitOnTimerFire: 入参形态需 Mac 上
//  pod install 生成 MusicFreeSpecs 后核对（见 .h）。
//

#import "NativeTimer.h"

@implementation NativeTimer {
  dispatch_queue_t _queue;
  NSMutableDictionary<NSNumber *, NSNumber *> *_pending;  // id → 当前有效 generation token
  uint64_t _seq;
}

RCT_EXPORT_MODULE()

- (instancetype)init {
  if (self = [super init]) {
    _queue = dispatch_queue_create("fun.upup.musicfree.timer", DISPATCH_QUEUE_SERIAL);
    _pending = [NSMutableDictionary dictionary];
  }
  return self;
}

- (void)setTimeout:(double)timerId ms:(double)ms {
  NSNumber *key = @(timerId);
  NSNumber *token;
  @synchronized (_pending) {
    token = @(++_seq);
    _pending[key] = token;  // 同 id 重排：换 token，旧回调将 no-op
  }
  __weak __typeof__(self) weakSelf = self;
  int64_t delayNs = (int64_t)(MAX(0.0, ms) * NSEC_PER_MSEC);
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, delayNs), _queue, ^{
    __typeof__(self) strongSelf = weakSelf;
    if (strongSelf == nil) {
      return;  // 模块已销毁
    }
    @synchronized (strongSelf->_pending) {
      // 仅当 token 仍匹配才发事件：clear 会移除 key（nil 不等）、重排会换新 token
      if (![strongSelf->_pending[key] isEqualToNumber:token]) {
        return;
      }
      [strongSelf->_pending removeObjectForKey:key];
    }
    [strongSelf emitOnTimerFire:@{@"id" : key}];
  });
}

- (void)clearTimeout:(double)timerId {
  @synchronized (_pending) {
    [_pending removeObjectForKey:@(timerId)];
  }
}

#pragma mark - TurboModule

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeTimerSpecJSI>(params);
}

@end
