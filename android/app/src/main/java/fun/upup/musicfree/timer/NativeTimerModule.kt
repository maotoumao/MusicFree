package `fun`.upup.musicfree.timer

import android.os.Handler
import android.os.HandlerThread
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import `fun`.upup.musicfree.specs.NativeTimerSpec
import java.util.concurrent.ConcurrentHashMap

/**
 * 后台可靠计时：专属 HandlerThread 上的 Handler（Looper 驱动，绕开 RN Choreographer 后台节流）
 * 进程存活期间按 uptime 计时触发；deep sleep 无 wakelock 时倒计时暂停、CPU 唤醒后继续（播放时
 * ExoPlayer 持 wakelock 故准点）；进程被杀则 pending 丢失、不触发（不穿透进程死亡，不用 AlarmManager）
 * NativeTimerSpec 由 codegen 生成（javaPackageName=...audio），首次 build 后才存在
 */
@ReactModule(name = NativeTimerModule.NAME)
class NativeTimerModule(reactContext: ReactApplicationContext) :
    NativeTimerSpec(reactContext) {

    private val thread = HandlerThread("MusicFreeTimer").apply { start() }
    private val handler = Handler(thread.looper)
    private val pending = ConcurrentHashMap<Double, Runnable>()

    @Volatile
    private var destroyed = false

    override fun setTimeout(timerId: Double, ms: Double) {
        if (destroyed) {
            return
        }
        val runnable = object : Runnable {
            override fun run() {
                // 只有映射仍指向自身才发事件：躲开「已被 clear / 被同 id 重排 / 已销毁」的竞态
                if (!destroyed && pending.remove(timerId, this)) {
                    val payload = Arguments.createMap()
                    payload.putDouble("id", timerId)
                    emitOnTimerFire(payload)
                }
            }
        }
        // 同 id 重排：撤掉旧任务，避免旧任务残留队列或反过来误删新映射
        pending.put(timerId, runnable)?.let { handler.removeCallbacks(it) }
        handler.postDelayed(runnable, ms.toLong().coerceAtLeast(0L))
    }

    override fun clearTimeout(timerId: Double) {
        pending.remove(timerId)?.let { handler.removeCallbacks(it) }
    }

    override fun invalidate() {
        destroyed = true
        handler.removeCallbacksAndMessages(null)
        pending.clear()
        thread.quitSafely()
        super.invalidate()
    }

    companion object {
        const val NAME = "NativeTimer"
    }
}
