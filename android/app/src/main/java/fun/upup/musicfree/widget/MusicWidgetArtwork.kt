package `fun`.upup.musicfree.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.util.LruCache
import androidx.core.graphics.ColorUtils
import `fun`.upup.musicfree.R
import kotlin.math.roundToInt

/** One shared background, with text contrast checked against the actual illustration. */
object MusicWidgetArtwork {
    private val backgrounds = LruCache<String, Bitmap>(2)

    @Synchronized
    fun background(context: Context, dark: Boolean, surface: Int, scrim: Int, foreground: Int): Bitmap {
        val fontScale = context.resources.configuration.fontScale.coerceAtLeast(1f)
        val key = "$dark:$surface:$scrim:$foreground:$fontScale"
        backgrounds.get(key)?.let { return it }
        // Keep the responsive RemoteViews transaction small; text/icons remain native.
        val width = 600
        val height = 276
        val base = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(base)
        canvas.drawColor(surface)
        val source = BitmapFactory.decodeResource(context.resources,
            if (dark) R.drawable.widget_dark_art else R.drawable.widget_light_art,
            BitmapFactory.Options().apply { inSampleSize = 2 })
        if (source != null) {
            canvas.drawBitmap(source, null, RectF(0f, 0f, width.toFloat(), height.toFloat()), Paint(Paint.FILTER_BITMAP_FLAG))
            source.recycle()
        }
        // The right text/control region is exactly the semantic surface, even if
        // a generated illustration contains slight color or brightness variation.
        canvas.drawPaint(Paint().apply {
            shader = LinearGradient(width * 0.44f, 0f, width * 0.54f, 0f,
                ColorUtils.setAlphaComponent(surface, 0), surface, Shader.TileMode.CLAMP)
        })
        val pixels = IntArray(width * height)
        base.getPixels(pixels, 0, width, 0, 0, width, height)
        // Bounds cover the native caption at the narrowest expanded width,
        // including large system text; wider instances need less of this scrim.
        val captionRight = ((18f + 70f * fontScale) / 320f).coerceAtMost(0.47f)
        var alpha = 0
        for (y in (height * 0.4f).toInt() until height) {
            for (x in 0..(width * captionRight).toInt()) {
                val pixel = pixels[y * width + x]
                fun readable(value: Int) = ColorUtils.calculateContrast(foreground,
                    ColorUtils.compositeColors(ColorUtils.setAlphaComponent(scrim, value), pixel)) >= 4.5
                if (!readable(alpha)) {
                    var low = alpha
                    var high = 255
                    while (low < high) {
                        val middle = (low + high) / 2
                        if (readable(middle)) high = middle else low = middle + 1
                    }
                    alpha = low
                }
            }
        }
        // Full contrast in the caption region, fading smoothly outside it.
        // This is a scrim over real artwork, not an independent left-hand card.
        if (alpha > 0) {
            for (y in 0 until height) {
                val vertical = ((y.toFloat() / height - 0.2f) / 0.2f).coerceIn(0f, 1f)
                for (x in 0 until (width * (captionRight + 0.08f)).toInt()) {
                    val horizontal = ((captionRight + 0.08f - x.toFloat() / width) / 0.08f).coerceIn(0f, 1f)
                    val opacity = (alpha * horizontal * vertical).roundToInt()
                    val index = y * width + x
                    pixels[index] = ColorUtils.compositeColors(ColorUtils.setAlphaComponent(scrim, opacity), pixels[index])
                }
            }
            base.setPixels(pixels, 0, width, 0, 0, width, height)
        }
        val result = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        Canvas(result).apply {
            clipPath(Path().apply { addRoundRect(0f, 0f, width.toFloat(), height.toFloat(), 42f, 42f, Path.Direction.CW) })
            drawBitmap(base, 0f, 0f, Paint(Paint.ANTI_ALIAS_FLAG))
        }
        base.recycle()
        // A launcher may still hold a previous bitmap after cache eviction.
        backgrounds.put(key, result)
        return result
    }
}
