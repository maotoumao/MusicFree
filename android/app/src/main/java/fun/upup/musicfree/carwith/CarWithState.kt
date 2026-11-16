package `fun`.upup.musicfree.carwith

import android.app.Application
import android.content.Context
import android.database.ContentObserver
import android.hardware.display.DisplayManager
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.Display
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.doublesymmetry.trackplayer.carwith.CarWithLyric
import java.lang.reflect.Method

/**
 * CarWith（小米汽车互联）连接态与车机深浅色的读数持有者 + JS 那一侧的门。
 *
 * 连接判据（两条都要成立，口径来自 CarWith_4.0.20 反汇编 + 真车实测）：
 *   1) 手机上有 CarWith 建出来的虚拟屏，屏名含 com.miui.carlink 或 com.xiaomi.ucar.minimap；
 *   2) Display.getType() == 5。type 这层**必须反射取** —— 它不在公共 android.jar 里，
 *      Kotlin 直接引用会 Unresolved reference、构建挂在 :app:compileReleaseKotlin；
 *      反射拿不到（个别 ROM 把它当非 SDK 接口拦了）时退回只判屏名。
 *   ★ 只判屏名会把别的虚拟屏（录屏、投屏、平行视窗）误判成已连接。
 *   ★ 屏名里别去匹配 com.autonavi.minimap —— 那是 CarWith 内嵌高德的资源 ID，不是屏名。
 *
 * 车机深浅：Settings.Global 的 ucar_night_mode（0 浅色 / 1 深色 / 读不到 -1）。
 *   这个键本就是 CarWith 写给第三方读的，无需权限、不动清单。
 *   ★ 断开时系统不会把它清零，所以那个残值一律不采信 —— 只在连着时读，断开直接记 -1。
 *
 * 任何读数失败一律按「没连着 / 读不到」返回，绝不向调用方抛。
 *
 * 心跳只在两把开关至少一把勾着时存在（5 秒一轮），关着时连屏都不去枚举 ——
 * 「没连着 CarWith 时上游行为逐字不变」这条要落到「没勾时连读数都不做」。
 */
object CarWithState {

    private const val KEY_NIGHT = "ucar_night_mode"
    private const val TYPE_VIRTUAL = 5
    private const val POLL_MS = 5000L

    private val MARKERS = arrayOf("com.miui.carlink", "com.xiaomi.ucar.minimap")

    @Volatile
    var connected = false
        private set

    /** -1 读不到 / 0 车机浅色 / 1 车机深色 */
    @Volatile
    var nightMode = -1
        private set

    /** 车机在深色档：断开时恒假（残值不采信） */
    val headUnitDark: Boolean
        get() = connected && nightMode == 1

    private var appContext: Context? = null

    @Volatile
    private var lyricEnabled = false

    @Volatile
    private var followThemeEnabled = false

    private val handler = Handler(Looper.getMainLooper())

    private val ticker = Runnable {
        refresh(false)
        scheduleLoop()
    }

    /** Display.getType() 的反射句柄，只解析一次 */
    private var typeMethod: Method? = null
    private var typeMethodResolved = false

    /**
     * ★ ContentObserver 必须留强引用：只存在局部变量里会被 GC 掉，之后系统就不再通知，
     *   表现是「车机翻深浅色，手机这边再也不跟」。
     */
    private var observer: ContentObserver? = null

    /** 由 MainApplication.onCreate() 调：车机翻灯时用户可能根本没开着界面 */
    fun init(app: Application) {
        appContext = app.applicationContext
    }

    private fun isActive(): Boolean = lyricEnabled || followThemeEnabled

    fun setLyricEnabled(value: Boolean) {
        if (lyricEnabled == value) return
        lyricEnabled = value
        // 开关翻了当场重发一次元数据：关掉后车机歌词要收掉，不能停在最后一句
        try {
            CarWithLyric.setEnabled(value)
        } catch (t: Throwable) {
            Log.w(CarWithLyric.TAG, "setEnabled 失败（已忽略）", t)
        }
        updateLoop()
        if (value) refresh(true)
    }

    fun setFollowTheme(value: Boolean) {
        if (followThemeEnabled == value) return
        followThemeEnabled = value
        updateLoop()
        if (value) refresh(true)
    }

    fun snapshot(): Map<String, Any> {
        return mapOf(
            "connected" to connected,
            "nightMode" to nightMode,
            "lyricEnabled" to lyricEnabled,
            "followTheme" to followThemeEnabled,
        )
    }

    private fun updateLoop() {
        handler.removeCallbacks(ticker)
        if (isActive()) {
            registerObserver()
            scheduleLoop()
        } else {
            unregisterObserver()
        }
    }

    /** 心跳只在还开着开关时续期；handler.postDelayed 配 Runnable，别用 what 消息那套 */
    private fun scheduleLoop() {
        if (!isActive()) return
        if (handler.hasCallbacks(ticker)) return
        handler.postDelayed(ticker, POLL_MS)
    }

    /**
     * 现读一轮。force = 刚勾开关 / 回前台那两次：那时连接态可能是冷的（心跳之前没跑过），
     * 就算算出来的值和上次一样也要把「当前该不该贴键」再交给发布一次。
     * 心跳那一轮（force = false）只在真的翻了才上报，5 秒一条会把诊断缓存刷满。
     */
    fun refresh(force: Boolean) {
        val ctx = appContext ?: return
        val nowConnected = readConnected(ctx)
        val nowNight = if (nowConnected) readNight(ctx) else -1
        val changed = nowConnected != connected || nowNight != nightMode
        connected = nowConnected
        nightMode = nowNight
        if (!changed && !force) return

        // 歌词的门控位就地更新：连着才贴键，断开当场把键收回
        // ★ 这道调用要包起来：CarWithLyric 是 RNTP 里的类，万一它初始化失败（类加载、
        //   依赖版本对不上），崩的应该是「车机没歌词」而不是手机播放/这条心跳本身
        try {
            CarWithLyric.setConnected(nowConnected)
        } catch (t: Throwable) {
            Log.w(CarWithLyric.TAG, "setConnected 失败（已忽略）", t)
        }
        emit()
    }

    // ------------------------------------------------------------------ 读数

    private fun readConnected(ctx: Context): Boolean {
        return try {
            val dm = ctx.getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager
                ?: return false
            for (d in dm.displays) {
                // ★ 公开桩里 Display 只有 getDisplayId()，没有 getId()（写 d.id 直接
                //   Unresolved reference: id，挂在 :app:compileReleaseKotlin）
                if (d.displayId == Display.DEFAULT_DISPLAY) continue
                val name = try {
                    d.name
                } catch (ignored: Throwable) {
                    null
                } ?: continue
                if (MARKERS.none { name.contains(it, ignoreCase = true) }) continue
                val t = readType(d)
                // type 读不到时退回只认屏名；读得到就必须是虚拟屏
                if (t == null || t == TYPE_VIRTUAL) return true
            }
            false
        } catch (ignored: Throwable) {
            false
        }
    }

    private fun readType(d: Display): Int? {
        if (!typeMethodResolved) {
            typeMethodResolved = true
            typeMethod = try {
                Display::class.java.getMethod("getType")
            } catch (ignored: Throwable) {
                null
            }
        }
        val m = typeMethod ?: return null
        return try {
            m.invoke(d) as? Int
        } catch (ignored: Throwable) {
            null
        }
    }

    private fun readNight(ctx: Context): Int {
        return try {
            Settings.Global.getInt(ctx.contentResolver, KEY_NIGHT, -1)
        } catch (ignored: Throwable) {
            -1
        }
    }

    // ------------------------------------------------------------------ 车机翻灯时的通知

    private fun registerObserver() {
        if (observer != null) return
        val ctx = appContext ?: return
        val o = object : ContentObserver(handler) {
            override fun onChange(selfChange: Boolean) {
                refresh(true)
            }
        }
        try {
            ctx.contentResolver.registerContentObserver(
                Settings.Global.getUriFor(KEY_NIGHT),
                false,
                o,
            )
            observer = o
        } catch (ignored: Throwable) {
        }
    }

    private fun unregisterObserver() {
        val o = observer ?: return
        observer = null
        try {
            appContext?.contentResolver?.unregisterContentObserver(o)
        } catch (ignored: Throwable) {
        }
    }

    // ------------------------------------------------------------------ 上报给 JS

    private var reporter: ((Map<String, Any>) -> Unit)? = null

    fun attachReporter(fn: (Map<String, Any>) -> Unit) {
        reporter = fn
    }

    fun detachReporter(fn: (Map<String, Any>) -> Unit) {
        if (reporter === fn) reporter = null
    }

    private fun emit() {
        val fn = reporter ?: return
        try {
            fn(snapshot())
        } catch (ignored: Throwable) {
        }
    }
}

/**
 * JS 侧的门：NativeModules.CarWithState
 *   getState(promise)              现值快照（读内存，这条路上不做任何 IPC）
 *   refresh(promise)               回前台 / 刚勾开关当场补一轮
 *   setLyricEnabled(bool, promise) 设置里的「车机投屏歌词」
 *   setFollowTheme(bool, promise)  设置里的「跟随CarWith切换主题」
 * 事件 onCarWithStateChange：{connected, nightMode, lyricEnabled, followTheme}
 */
class CarWithStateModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "CarWithState"

    private val reporter: (Map<String, Any>) -> Unit = { snap ->
        val ctx = reactApplicationContext
        if (ctx.hasActiveReactInstance()) {
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("onCarWithStateChange", toMap(snap))
        }
    }

    init {
        CarWithState.attachReporter(reporter)
    }

    override fun invalidate() {
        CarWithState.detachReporter(reporter)
        super.invalidate()
    }

    // NativeEventEmitter 要求模块带这两个空方法，否则 JS 侧报 "has no listeners"
    @ReactMethod
    fun addListener(eventType: String?) {
    }

    @ReactMethod
    fun removeListeners(count: Int) {
    }

    @ReactMethod
    fun getState(promise: Promise) {
        promise.resolve(toMap(CarWithState.snapshot()))
    }

    @ReactMethod
    fun refresh(promise: Promise) {
        CarWithState.refresh(true)
        promise.resolve(toMap(CarWithState.snapshot()))
    }

    @ReactMethod
    fun setLyricEnabled(enabled: Boolean, promise: Promise) {
        CarWithState.setLyricEnabled(enabled)
        promise.resolve(null)
    }

    @ReactMethod
    fun setFollowTheme(follow: Boolean, promise: Promise) {
        CarWithState.setFollowTheme(follow)
        promise.resolve(null)
    }

    private fun toMap(snap: Map<String, Any>): WritableMap {
        val map = Arguments.createMap()
        for ((k, v) in snap) {
            when (v) {
                is Boolean -> map.putBoolean(k, v)
                is Int -> map.putInt(k, v)
            }
        }
        return map
    }
}
