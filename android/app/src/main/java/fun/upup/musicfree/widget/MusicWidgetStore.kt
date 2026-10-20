package `fun`.upup.musicfree.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Shader
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream
import java.lang.ref.WeakReference
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient
import okhttp3.Request

/** Persist metadata/colors, never a playing flag that could survive a dead player. */
object MusicWidgetStore {
    @Volatile var reactContext: WeakReference<ReactApplicationContext>? = null
    @Volatile var playing = false
    @Volatile var loading = false
    @Volatile var discovering = false
    @Volatile var artworkBitmap: Bitmap? = null
    private var artworkKey: String? = null
    private var requestedKey: String? = null
    private var artworkRevision = 0
    private var retryArtworkAfter = 0L
    private val executor = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private val client by lazy { OkHttpClient.Builder().callTimeout(7, TimeUnit.SECONDS).build() }

    fun preferences(context: Context) = context.getSharedPreferences("music_widget", Context.MODE_PRIVATE)

    fun isReady() = reactContext?.get()?.hasActiveReactInstance() == true

    fun updatePlayback(context: Context, snapshot: ReadableMap) {
        playing = snapshot.getBoolean("playing")
        loading = snapshot.getBoolean("loading")
        discovering = snapshot.hasKey("discovering") && snapshot.getBoolean("discovering")
        preferences(context).edit()
            .putString("title", snapshot.getString("title"))
            .putString("artist", snapshot.getString("artist"))
            .putString("artwork", snapshot.getString("artwork"))
            .putBoolean("hasTrack", snapshot.getBoolean("hasTrack"))
            .apply()
        ensureArtwork(context)
        MusicWidgetProvider.updateAll(context)
    }

    /** Bounded decoding/network work; an old download can never replace a newer song. */
    @Synchronized
    fun ensureArtwork(context: Context, finished: () -> Unit = {}) {
        val app = context.applicationContext
        val key = preferences(app).getString("artwork", "").orEmpty()
        if ((key == artworkKey && (artworkBitmap != null || SystemClock.elapsedRealtime() < retryArtworkAfter)) || key == requestedKey) {
            finished()
            return
        }
        artworkKey = null
        artworkBitmap = null
        requestedKey = key
        val revision = ++artworkRevision
        if (MusicWidgetProvider.ids(app).isEmpty() || key.isBlank()) {
            requestedKey = null
            finished()
            return
        }
        executor.execute {
            // Rapid skips can enqueue many covers behind a slow request. Skip stale
            // work before doing any I/O, rather than downloading the whole backlog.
            if (synchronized(this) { revision != artworkRevision }) {
                main.post { finished() }
                return@execute
            }
            val bitmap = try {
                val cachedFile = File(app.cacheDir, "music-widget-cover.png")
                val cachedKey = preferences(app).getString("cachedArtwork", null)
                if (cachedKey == key && cachedFile.isFile) {
                    cachedFile.inputStream().use { decode(it) }
                } else {
                    load(app, key)
                }
            } catch (_: Exception) {
                null
            } catch (_: OutOfMemoryError) {
                null
            }
            main.post {
                synchronized(this) {
                    if (revision == artworkRevision) {
                        artworkBitmap = bitmap
                        artworkKey = key
                        // A later playback/launcher event may retry; no polling or timers.
                        retryArtworkAfter = if (bitmap == null) SystemClock.elapsedRealtime() + 30_000 else 0L
                        requestedKey = null
                        // Keep a single small cover for launcher/process recreation.
                        if (bitmap != null) {
                            executor.execute {
                                try {
                                    File(app.cacheDir, "music-widget-cover.png").outputStream().use {
                                        bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)
                                    }
                                    preferences(app).edit().putString("cachedArtwork", key).apply()
                                } catch (_: Exception) { /* artwork is optional */ }
                            }
                        }
                        MusicWidgetProvider.updateAll(app)
                    }
                }
                finished()
            }
        }
    }

    private fun load(context: Context, key: String): Bitmap? {
        val uri = Uri.parse(key)
        return when (uri.scheme) {
            "https", "http" -> client.newCall(Request.Builder().url(key).build()).execute().use { response ->
                if (!response.isSuccessful) null else response.body?.byteStream()?.use { decode(it) }
            }
            "content", "file", "android.resource" -> context.contentResolver.openInputStream(uri)?.use { decode(it) }
            null -> if (key.startsWith("/")) File(key).inputStream().use { decode(it) } else null
            else -> null
        }
    }

    private fun decode(input: InputStream): Bitmap? {
        val bytes = ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        var count = input.read(buffer)
        while (count != -1) {
            if (bytes.size() + count > 4 * 1024 * 1024) return null
            bytes.write(buffer, 0, count)
            count = input.read(buffer)
        }
        val data = bytes.toByteArray()
        val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(data, 0, data.size, options)
        if (options.outWidth <= 0 || options.outHeight <= 0) return null
        options.inSampleSize = 1
        while (maxOf(options.outWidth, options.outHeight) / options.inSampleSize > 384) options.inSampleSize *= 2
        options.inJustDecodeBounds = false
        val source = BitmapFactory.decodeByteArray(data, 0, data.size, options) ?: return null
        val result = Bitmap.createBitmap(192, 192, Bitmap.Config.ARGB_8888)
        val scale = maxOf(192f / source.width, 192f / source.height)
        val shader = BitmapShader(source, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
        shader.setLocalMatrix(android.graphics.Matrix().apply {
            setScale(scale, scale)
            postTranslate((192 - source.width * scale) / 2, (192 - source.height * scale) / 2)
        })
        Canvas(result).drawRoundRect(0f, 0f, 192f, 192f, 24f, 24f, Paint(Paint.ANTI_ALIAS_FLAG).apply { this.shader = shader })
        source.recycle()
        return result
    }
}
