package `fun`.upup.musicfree.floatingLyric

import android.content.Context
import android.graphics.Color
import android.util.TypedValue
import android.view.View
import kotlin.math.roundToInt

/** 呈现形态；wire 值由 JS 的 floatingLyric.mode 下发 */
enum class FloatingLyricMode {
    /** 桌面歌词卡：可拖、可锁、带播放控制 */
    Desktop,

    /** 状态栏条：贴顶单行，纯展示 */
    StatusBar,
    ;

    companion object {
        private const val WIRE_STATUS_BAR = "statusBar"

        /** 桥字符串 → 形态；未知值回落桌面卡，不因 JS 传错值而没界面 */
        fun from(wire: String?): FloatingLyricMode =
            if (wire == WIRE_STATUS_BAR) StatusBar else Desktop
    }
}

/** dp → 像素（浮层全程用同一套换算） */
internal fun Context.dpToPx(dp: Float): Float =
    TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP,
        dp,
        resources.displayMetrics,
    )

internal fun Context.dpToPxInt(dp: Float): Int = dpToPx(dp).roundToInt()

private val HEX_COLOR = Regex("^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$")

/** CSS #RRGGBB / #RRGGBBAA（末位 alpha）→ Android ARGB；非法回退白 */
internal fun cssToArgb(css: String): Int {
    if (!HEX_COLOR.matches(css)) {
        return Color.WHITE
    }
    val hex = css.substring(1)
    return if (hex.length == 6) {
        (0xFF shl 24) or hex.toInt(16)
    } else {
        val rgba = hex.toLong(16)
        val rgb = (rgba ushr 8).toInt()
        val a = (rgba and 0xFF).toInt()
        (a shl 24) or rgb
    }
}

/**
 * 浮层内容视图的共同契约。
 * 窗口只负责窗口本身（安全区换算、位置、穿透、参数下发），形态差异全部收在实现里：
 * 桌面歌词卡可交互，状态栏条纯展示
 */
interface FloatingLyricContent {

    /** 挂进窗口容器的视图，即实现者自身 */
    val view: View

    /** 恒穿透（状态栏条）还是按锁定态切换（桌面歌词卡） */
    val alwaysPassthrough: Boolean

    /**
     * 位置换算是否用整屏边界。
     * 状态栏条要能贴到系统状态栏那一带（用户心智里的「状态栏歌词」），故不扣系统栏内距；
     * 桌面歌词卡可交互，盖住状态栏会挡住时间电量、也会干扰下拉通知，仍按安全区
     */
    val usesFullBounds: Boolean

    fun applyStyle(config: FloatingLyricConfig)

    fun setLine(original: String, translation: String?)

    /** 收起时复位一次性状态（歌词内容、动画、计时器等） */
    fun resetTransientState()

    fun dispose()

    /** 由安全区可用宽算出实际窗口宽 */
    fun windowWidth(safeWidth: Int): Int

    /** 归一化锚点的基准高度：可移动范围 = 安全区高 − 它 */
    fun anchorHeight(): Int

    // —— 以下只有可交互形态才有意义，纯展示形态不实现 ——

    fun setPlaying(playing: Boolean) {}

    fun setLocked(locked: Boolean) {}

    fun setDragVisual(active: Boolean) {}
}
