package `fun`.upup.musicfree.lyricUtil

import android.app.Activity
import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.ColorDrawable
import android.hardware.SensorManager
import android.os.Build
import android.util.DisplayMetrics
import android.util.Log
import android.view.Gravity
import android.view.MotionEvent
import android.view.OrientationEventListener
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import com.facebook.react.bridge.ReactContext



class LyricView(private val reactContext: ReactContext) : Activity(), View.OnTouchListener {

    private var windowManager: WindowManager? = null
    private var orientationEventListener: OrientationEventListener? = null
    private var layoutParams: WindowManager.LayoutParams? = null
    private var tv: TextView? = null

    // 窗口信息
    private var windowWidth = 0.0
    private var windowHeight = 0.0
    private var widthPercent = 0.0
    private var leftPercent = 0.0
    private var topPercent = 0.0

    override fun onTouch(view: View, motionEvent: MotionEvent): Boolean {
        Log.d("touch", "Desktop Touch")
        return false
    }

    // 展示歌词窗口
    fun showLyricWindow(initText: String?, options: Map<String, Any>) {
        try {
            if (windowManager == null) {
                windowManager = reactContext.getSystemService(WINDOW_SERVICE) as WindowManager
                layoutParams = WindowManager.LayoutParams()

                val outMetrics = DisplayMetrics()
                windowManager?.defaultDisplay?.getMetrics(outMetrics)
                windowWidth = outMetrics.widthPixels.toDouble()
                windowHeight = outMetrics.heightPixels.toDouble()

                layoutParams?.type = if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O)
                    WindowManager.LayoutParams.TYPE_SYSTEM_ALERT
                else
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY

                /*
                 * topPercent: number;
                 * leftPercent: number;
                 * align: number;
                 * color: string;
                 * backgroundColor: string;
                 * widthPercent: number;
                 * fontSize: number;
                 */
                val topPercent = options["topPercent"]
                val leftPercent = options["leftPercent"]
                val align = options["align"]
                val color = options["color"]
                val backgroundColor = options["backgroundColor"]
                val widthPercent = options["widthPercent"]
                val fontSize = options["fontSize"]

                this.widthPercent = widthPercent?.toString()?.toDouble() ?: 0.5

                layoutParams?.width = (this.widthPercent * windowWidth).toInt()
                layoutParams?.height = WindowManager.LayoutParams.WRAP_CONTENT
                layoutParams?.gravity = Gravity.TOP or Gravity.START

                this.leftPercent = leftPercent?.toString()?.toDouble() ?: 0.5
                layoutParams?.x = (this.leftPercent * (windowWidth - layoutParams!!.width)).toInt()
                layoutParams?.y = 0

                layoutParams?.flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                        WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
                        WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE

                layoutParams?.format = PixelFormat.TRANSPARENT

                tv = TextView(reactContext).apply {
                    text = initText ?: ""
                    textSize = fontSize?.toString()?.toFloat() ?: 14f
                    setBackgroundColor(Color.parseColor(rgba2argb(backgroundColor?.toString() ?: "#84888153")))
                    setTextColor(Color.parseColor(rgba2argb(color?.toString() ?: "#FFE9D2")))
                    setPadding(12, 6, 12, 6)
                    gravity = align?.toString()?.toInt() ?: Gravity.CENTER
                }
                windowManager?.addView(tv, layoutParams)

                topPercent?.toString()?.toDouble()?.let { setTopPercent(it) }

                listenOrientationChange()
            }
        } catch (e: Exception) {
            hideLyricWindow()
            throw e
        }
    }

    private fun listenOrientationChange() {
        if (windowManager == null) return

        if (orientationEventListener == null) {
            orientationEventListener = object : OrientationEventListener(reactContext, SensorManager.SENSOR_DELAY_NORMAL) {
                override fun onOrientationChanged(orientation: Int) {
                    if (windowManager != null) {
                        val outMetrics = DisplayMetrics()
                        windowManager?.defaultDisplay?.getMetrics(outMetrics)
                        windowWidth = outMetrics.widthPixels.toDouble()
                        windowHeight = outMetrics.heightPixels.toDouble()
                        layoutParams?.width = (widthPercent * windowWidth).toInt()
                        layoutParams?.x = (leftPercent * (windowWidth - layoutParams!!.width)).toInt()
                        layoutParams?.y = (topPercent * (windowHeight - tv!!.height)).toInt()
                        windowManager?.updateViewLayout(tv, layoutParams)
                    }
                }
            }
        }

        if (orientationEventListener?.canDetectOrientation() == true) {
            orientationEventListener?.enable()
        }
    }

    private fun unlistenOrientationChange() {
        orientationEventListener?.disable()
    }

    private fun rgba2argb(color: String): String {
        return if (color.length == 9) {
            color[0] + color.substring(7, 9) + color.substring(1, 7)
        } else {
            color
        }
    }

    // 隐藏歌词窗口
    fun hideLyricWindow() {
        if (windowManager != null) {
            tv?.let {
                try {
                    windowManager?.removeView(it)
                } catch (e: Exception) {
                    // Handle exception
                }
                tv = null
            }
            windowManager = null
            layoutParams = null
            unlistenOrientationChange()
        }
    }

    // 设置歌词内容
    fun setText(text: String) {
        tv?.text = text
    }

    fun setAlign(gravity: Int) {
        tv?.gravity = gravity
    }

    fun setTopPercent(pct: Double) {
        var percent = pct.coerceIn(0.0, 1.0)
        tv?.let {
            layoutParams?.y = (percent * (windowHeight - it.height)).toInt()
            windowManager?.updateViewLayout(it, layoutParams)
        }
        this.topPercent = percent
    }

    fun setLeftPercent(pct: Double) {
        var percent = pct.coerceIn(0.0, 1.0)
        tv?.let {
            layoutParams?.x = (percent * (windowWidth - layoutParams!!.width)).toInt()
            windowManager?.updateViewLayout(it, layoutParams)
        }
        this.leftPercent = percent
    }

    fun setColors(textColor: String?, backgroundColor: String?) {
        tv?.let {
            textColor?.let { color -> it.setTextColor(Color.parseColor(rgba2argb(color))) }
            backgroundColor?.let { color ->
                it.background = ColorDrawable(Color.parseColor(rgba2argb(color)))
            }
        }
    }

    fun setWidth(pct: Double) {
        var percent = pct.coerceIn(0.3, 1.0)
        tv?.let {
            val width = (percent * windowWidth).toInt()
            val originalWidth = layoutParams?.width ?: 0
            layoutParams?.x = if (width <= originalWidth) {
                layoutParams!!.x + (originalWidth - width) / 2
            } else {
                layoutParams!!.x - (width - originalWidth) / 2
            }.coerceAtLeast(0).coerceAtMost((windowWidth - width).toInt())
            layoutParams?.width = width
            windowManager?.updateViewLayout(it, layoutParams)
        }
        this.widthPercent = percent
    }

    fun setFontSize(fontSize: Float) {
        tv?.textSize = fontSize
    }
}