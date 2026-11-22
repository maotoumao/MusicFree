package `fun`.upup.musicfree.blurlyric

import android.content.Context
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Color
import android.text.Layout
import android.text.StaticLayout
import android.graphics.Typeface
import android.text.TextPaint
import android.view.View

/**
 * 模糊歌词行视图 (Canvas + BlurMaskFilter 真高斯模糊)
 *
 * 当前播放行: blurRadius = 0, 完全清晰
 * 非当前行: blurRadius 随距离递增, 越远越模糊
 */
class BlurLyricView(context: Context) : View(context) {

    init {
        // BlurMaskFilter 只在软件层生效
        setLayerType(View.LAYER_TYPE_SOFTWARE, null)
    }

    private var text: String = ""
    private var blurRadiusPx: Float = 0f
    private var textColor: Int = Color.WHITE
    private var textSizePx: Float = 40f
    private var textAlign: Layout.Alignment = Layout.Alignment.ALIGN_NORMAL

    private val textPaint = TextPaint(TextPaint.ANTI_ALIAS_FLAG).apply {
        color = textColor
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }

    private var staticLayout: StaticLayout? = null

    fun setText(value: String?) {
        text = value ?: ""
        rebuild()
        invalidate()
    }

    fun setBlurRadius(value: Float) {
        blurRadiusPx = value
        applyMask()
        invalidate()
    }

    fun setTextColor(value: Int) {
        textColor = value
        textPaint.color = value
        invalidate()
    }

    fun setTextSizePx(value: Float) {
        textSizePx = value
        textPaint.textSize = value
        rebuild()
        invalidate()
    }

    fun setTextAlign(value: Layout.Alignment) {
        textAlign = value
        rebuild()
        invalidate()
    }

    private fun applyMask() {
        textPaint.maskFilter =
            if (blurRadiusPx > 0f) {
                BlurMaskFilter(blurRadiusPx, BlurMaskFilter.Blur.NORMAL)
            } else {
                null
            }
    }

    private fun rebuild() {
        val available = width - paddingLeft - paddingRight
        staticLayout =
            if (available > 0 && text.isNotEmpty()) {
                StaticLayout.Builder.obtain(text, 0, text.length, textPaint, available)
                    .setAlignment(textAlign)
                    .setIncludePad(false)
                    .build()
            } else {
                null
            }
        requestLayout()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        rebuild()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val layout = staticLayout ?: return
        val dx = paddingLeft + (width - paddingLeft - paddingRight - layout.width) / 2f
        canvas.save()
        canvas.translate(dx, paddingTop.toFloat())
        layout.draw(canvas)
        canvas.restore()
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val w = MeasureSpec.getSize(widthMeasureSpec)
        val available = w - paddingLeft - paddingRight
        val layout =
            if (available > 0 && text.isNotEmpty()) {
                StaticLayout.Builder.obtain(text, 0, text.length, textPaint, available)
                    .setAlignment(textAlign)
                    .setIncludePad(false)
                    .build()
            } else {
                null
            }
        val contentHeight =
            (layout?.height ?: textSizePx.toInt()) + paddingTop + paddingBottom +
                // 模糊光晕向外扩散, 预留避免被裁
                if (blurRadiusPx > 0f) (blurRadiusPx * 2).toInt() else 0
        // JS 指定固定高度 (EXACTLY) 时按指定高度渲染
        val h =
            if (MeasureSpec.getMode(heightMeasureSpec) == MeasureSpec.EXACTLY) {
                MeasureSpec.getSize(heightMeasureSpec)
            } else {
                maxOf(contentHeight, minimumHeight)
            }
        setMeasuredDimension(w, h)
    }
}
