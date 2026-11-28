package `fun`.upup.musicfree.floatingLyric

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.TextView

/**
 * 状态栏条：贴顶的单行歌词，纯展示。
 * 窗口恒穿透（窗口侧按 alwaysPassthrough 处理），所以这里没有任何手势与控件；
 * 窗口本身占满可用宽以便居中，底色只画在文字上、不铺满整行
 */
@SuppressLint("ViewConstructor")
class FloatingLyricBarView(context: Context) : FrameLayout(context), FloatingLyricContent {

    override val view: View get() = this

    /** 纯展示形态：一次触摸都不接收 */
    override val alwaysPassthrough: Boolean = true

    /** 位置按整屏算：positionY=0 要能落到系统状态栏那一带，而不是它的下沿 */
    override val usesFullBounds: Boolean = true

    private val surface = GradientDrawable().apply {
        cornerRadius = context.dpToPx(RADIUS_DP)
    }

    private val lyricView = TextView(context).apply {
        maxLines = 1
        ellipsize = TextUtils.TruncateAt.END
        gravity = Gravity.CENTER
        includeFontPadding = false
        background = surface
        // 无歌词时也留一段底，否则背景块塌成一个点、看着像残影
        minWidth = context.dpToPxInt(MIN_WIDTH_DP)
        val padH = context.dpToPxInt(TEXT_PADDING_H_DP)
        val padV = context.dpToPxInt(TEXT_PADDING_V_DP)
        setPadding(padH, padV, padH, padV)
        // 常驻阴影：默认无底色时全靠它在浅色壁纸上保可读
        setShadowLayer(context.dpToPx(SHADOW_RADIUS_DP), 0f, context.dpToPx(1f), SHADOW_COLOR)
    }

    private var backgroundOpacity = 0.0

    init {
        addView(
            lyricView,
            LayoutParams(
                LayoutParams.WRAP_CONTENT,
                LayoutParams.WRAP_CONTENT,
                Gravity.CENTER_HORIZONTAL,
            ),
        )
        renderSurface()
    }

    override fun applyStyle(config: FloatingLyricConfig) {
        backgroundOpacity = config.backgroundOpacity
        lyricView.setTextColor(cssToArgb(config.textColor))
        // 字号用 dp 而非 sp：App 受控字号，档位即最终视觉大小，不再叠系统字体缩放
        lyricView.setTextSize(TypedValue.COMPLEX_UNIT_DIP, config.fontSize.toFloat())
        renderSurface()
    }

    /** 恒 1 行、只显示原文——放不下译文，也不做「原文 · 译文」拼接 */
    override fun setLine(original: String, translation: String?) {
        lyricView.text = original
    }

    override fun resetTransientState() {
        lyricView.text = ""
    }

    override fun dispose() {}

    /** 占满可用宽（左右各留 12dp）使文字能居中；底色只跟文字走，不会铺满 */
    override fun windowWidth(safeWidth: Int): Int =
        (safeWidth - 2 * context.dpToPxInt(SIDE_MARGIN_DP)).coerceAtLeast(0)

    override fun anchorHeight(): Int = if (height > 0) height else measuredHeight

    private fun renderSurface() {
        val alpha = (backgroundOpacity.coerceIn(0.0, 1.0) * 255).toInt()
        surface.setColor(Color.argb(alpha, 0, 0, 0))
    }

    companion object {
        private const val SIDE_MARGIN_DP = 12f
        private const val MIN_WIDTH_DP = 120f
        private const val RADIUS_DP = 10f
        private const val TEXT_PADDING_H_DP = 10f
        private const val TEXT_PADDING_V_DP = 3f
        private const val SHADOW_RADIUS_DP = 3f
        private const val SHADOW_COLOR = 0x64000000.toInt()
    }
}
