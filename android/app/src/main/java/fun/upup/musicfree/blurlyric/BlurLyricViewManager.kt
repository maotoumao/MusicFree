package `fun`.upup.musicfree.blurlyric

import android.text.Layout
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.uimanager.SimpleViewManager

@Suppress("DEPRECATION")
class BlurLyricViewManager : SimpleViewManager<BlurLyricView>() {

    override fun getName(): String = "BlurLyricView"


    override fun createViewInstance(reactContext: ThemedReactContext): BlurLyricView =
        BlurLyricView(reactContext)

    @ReactProp(name = "text")
    fun setText(view: BlurLyricView, value: String?) {
        view.setText(value)
    }

    /** 模糊半径 (dp), 0 表示当前行不模糊 */
    @ReactProp(name = "blurRadius", defaultFloat = 0f)
    fun setBlurRadius(view: BlurLyricView, value: Float) {
        view.setBlurRadius(value * view.resources.displayMetrics.density)
    }

    @ReactProp(name = "color", customType = "Color")
    fun setColor(view: BlurLyricView, value: Int?) {
        view.setTextColor(value ?: android.graphics.Color.WHITE)
    }

    /** 字号 (dp) */
    @ReactProp(name = "fontSize", defaultFloat = 14f)
    fun setTextSize(view: BlurLyricView, value: Float) {
        view.setTextSizePx(value * view.resources.displayMetrics.density)
    }

    @ReactProp(name = "textAlign")
    fun setTextAlign(view: BlurLyricView, value: String?) {
        view.setTextAlign(
            when (value) {
                "center" -> Layout.Alignment.ALIGN_CENTER
                "right" -> Layout.Alignment.ALIGN_OPPOSITE
                else -> Layout.Alignment.ALIGN_NORMAL
            },
        )
    }
}

