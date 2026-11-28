package `fun`.upup.musicfree.floatingLyric

import android.content.Intent
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.module.annotations.ReactModule
import `fun`.upup.musicfree.MainActivity
import `fun`.upup.musicfree.specs.NativeFloatingLyricSpec
import kotlin.math.roundToInt

/**
 * 悬浮歌词浮层 TurboModule：收 JS 指令 → 主线程委托浮层；浮层交互事件回推 JS（零业务，JS 持权威）
 * ReadableMap 参数在方法内先解析成 FloatingLyricConfig（避免 post 后跨线程访问失效），再上主线程
 * NativeFloatingLyricSpec 由 codegen 生成，首次 build 后才存在
 */
@ReactModule(name = NativeFloatingLyricModule.NAME)
class NativeFloatingLyricModule(reactContext: ReactApplicationContext) :
    NativeFloatingLyricSpec(reactContext) {

    private var window: FloatingLyricWindow? = null

    override fun show(config: ReadableMap, promise: Promise) {
        val parsed = parseConfig(config)
        UiThreadUtil.runOnUiThread {
            try {
                ensureWindow().show(parsed)
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("floating_lyric_show_failed", e)
            }
        }
    }

    override fun hide(promise: Promise) {
        UiThreadUtil.runOnUiThread {
            try {
                window?.hide()
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("floating_lyric_hide_failed", e)
            }
        }
    }

    override fun update(config: ReadableMap, promise: Promise) {
        val parsed = parseConfig(config)
        UiThreadUtil.runOnUiThread {
            try {
                window?.update(parsed)
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("floating_lyric_update_failed", e)
            }
        }
    }

    override fun setLine(original: String, translation: String?) {
        UiThreadUtil.runOnUiThread {
            window?.setLine(original, translation)
        }
    }

    override fun setPlaying(playing: Boolean) {
        UiThreadUtil.runOnUiThread {
            window?.setPlaying(playing)
        }
    }

    private fun ensureWindow(): FloatingLyricWindow =
        window ?: FloatingLyricWindow(
            reactApplicationContext,
            onPositionChange = { y ->
                val payload = Arguments.createMap()
                payload.putDouble("y", y.toDouble())
                emitOnPositionChange(payload)
            },
            onRequestLock = { emitOnRequestLock() },
            onRequestClose = { emitOnRequestClose() },
            onRequestOpenApp = {
                bringAppToFront()
                emitOnRequestOpenApp()
            },
            onRequestOpenSettings = { emitOnRequestOpenSettings() },
            onRequestPlayToggle = { emitOnRequestPlayToggle() },
            onRequestSkipToNext = { emitOnRequestSkipToNext() },
            onRequestSkipToPrevious = { emitOnRequestSkipToPrevious() },
            onTextColorChange = { hex ->
                val payload = Arguments.createMap()
                payload.putString("hex", hex)
                emitOnTextColorChange(payload)
            },
            onFontSizeChange = { sp ->
                val payload = Arguments.createMap()
                payload.putDouble("sp", sp.toDouble())
                emitOnFontSizeChange(payload)
            },
        ).also { window = it }

    /**
     * 把 App 拉到前台：JS 无从启动 Activity，只能原生做；落到哪个页面由 JS 收事件后决定
     * 悬浮窗权限的应用不受后台启动 Activity 限制；MainActivity 是 singleTask，已有实例只会被带回前台
     */
    private fun bringAppToFront() {
        val intent = Intent(reactApplicationContext, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { reactApplicationContext.startActivity(intent) }
    }

    private fun parseConfig(map: ReadableMap): FloatingLyricConfig =
        FloatingLyricConfig(
            mode = FloatingLyricMode.from(map.getString("mode")),
            fontSize = if (map.hasKey("fontSize")) {
                map.getDouble("fontSize").roundToInt()
            } else {
                DEFAULT_FONT_SIZE
            },
            fontSizeSteps = readIntList(map, "fontSizeSteps"),
            textColor = map.getString("textColor") ?: DEFAULT_TEXT_COLOR,
            textColorOptions = readStringList(map, "textColorOptions"),
            backgroundOpacity = if (map.hasKey("backgroundOpacity")) {
                map.getDouble("backgroundOpacity")
            } else {
                DEFAULT_BACKGROUND_OPACITY
            },
            showTranslation = map.hasKey("showTranslation") && map.getBoolean("showTranslation"),
            locked = map.hasKey("locked") && map.getBoolean("locked"),
            positionY = if (map.hasKey("positionY")) {
                map.getDouble("positionY").toFloat()
            } else {
                DEFAULT_POSITION_Y
            },
            labels = parseLabels(map.getMap("labels")),
        )

    /** 文案缺失时留空：读屏标签宁可没有，也不在原生放一份会和 App 语言打架的兜底文案 */
    private fun parseLabels(map: ReadableMap?): FloatingLyricLabels =
        FloatingLyricLabels(
            openApp = map?.getString("openApp").orEmpty(),
            close = map?.getString("close").orEmpty(),
            lock = map?.getString("lock").orEmpty(),
            settings = map?.getString("settings").orEmpty(),
            play = map?.getString("play").orEmpty(),
            pause = map?.getString("pause").orEmpty(),
            previous = map?.getString("previous").orEmpty(),
            next = map?.getString("next").orEmpty(),
            textColor = map?.getString("textColor").orEmpty(),
            fontSize = map?.getString("fontSize").orEmpty(),
            fontSmaller = map?.getString("fontSmaller").orEmpty(),
            fontLarger = map?.getString("fontLarger").orEmpty(),
            lockedHint = map?.getString("lockedHint").orEmpty(),
        )

    /** JS 数字统一按 double 读再取整，避免 getInt 对浮点元素的实现差异 */
    private fun readIntList(map: ReadableMap, key: String): List<Int> {
        val array = map.getArray(key) ?: return emptyList()
        return (0 until array.size()).map { array.getDouble(it).roundToInt() }
    }

    private fun readStringList(map: ReadableMap, key: String): List<String> {
        val array = map.getArray(key) ?: return emptyList()
        return (0 until array.size()).mapNotNull { array.getString(it) }
    }

    override fun invalidate() {
        UiThreadUtil.runOnUiThread {
            window?.dispose()
            window = null
        }
        super.invalidate()
    }

    companion object {
        const val NAME = "NativeFloatingLyric"
        private const val DEFAULT_FONT_SIZE = 18
        private const val DEFAULT_TEXT_COLOR = "#FFFFFF"
        private const val DEFAULT_BACKGROUND_OPACITY = 0.55
        private const val DEFAULT_POSITION_Y = 0.18f
    }
}
